// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TitleRegistry.sol";
import "./AgentCommission.sol";

/// @title Transactify Marketplace
/// @notice Handles property listings, English auctions, automated escrow, and agent payouts
contract TransactifyMarketplace {
    enum EscrowState {
        Auction,
        AwaitingTitleTransfer,
        Completed,
        Refunded,
        Cancelled
    }

    struct Listing {
        string propertyId;
        address seller;
        address agent;
        uint64 biddingEnd;
        uint64 escrowDeadline;
        uint64 createdAt;
        uint128 reservePrice;
        uint128 minIncrement;
        uint128 buyNowPrice;
        uint256 highestBid;
        address highestBidder;
        EscrowState state;
        bool exists;
    }

    TitleRegistry public immutable titleRegistry;
    AgentCommission public immutable commissionContract;

    uint256 public immutable escrowDuration;
    uint64 public immutable antiSnipingExtension;
    uint64 public immutable antiSnipingWindow;
    uint256 public listingCount;

    mapping(uint256 => Listing) private listings;
    mapping(uint256 => mapping(address => uint256)) public pendingReturns;
    mapping(string => uint256) private activeListingForProperty;

    bool private locked;

    event ListingCreated(
        uint256 indexed listingId,
        string propertyId,
        address indexed seller,
        uint256 reservePrice,
        uint256 biddingEnd
    );
    event ListingCancelled(uint256 indexed listingId);
    event BidPlaced(uint256 indexed listingId, address indexed bidder, uint256 amount);
    event AuctionFinalized(uint256 indexed listingId, address highestBidder, uint256 amount);
    event EscrowCompleted(uint256 indexed listingId, address buyer, uint256 amount);
    event EscrowRefunded(uint256 indexed listingId, address buyer, uint256 amount);
    event BidWithdrawn(uint256 indexed listingId, address indexed bidder, uint256 amount);

    modifier listingExists(uint256 listingId) {
        require(listings[listingId].exists, "Listing not found");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "Reentrancy");
        locked = true;
        _;
        locked = false;
    }

    constructor(
        address _titleRegistry,
        address _commissionContract,
        uint256 _escrowDurationSeconds,
        uint256 _antiSnipingWindow,
        uint256 _antiSnipingExtension
    ) {
        require(_titleRegistry != address(0), "Registry required");
        require(_commissionContract != address(0), "Commission contract required");
        require(_escrowDurationSeconds >= 1 days, "Escrow duration too short");
        require(_antiSnipingExtension == 0 || _antiSnipingExtension >= 1 minutes, "Extension too small");
        require(_antiSnipingWindow <= type(uint64).max, "Window too large");
        require(_antiSnipingExtension <= type(uint64).max, "Extension too large");

        titleRegistry = TitleRegistry(_titleRegistry);
        commissionContract = AgentCommission(_commissionContract);
        escrowDuration = _escrowDurationSeconds;
        antiSnipingWindow = uint64(_antiSnipingWindow);
        antiSnipingExtension = uint64(_antiSnipingExtension);
    }

    /// @notice sellers publish verified properties for bidding
    function createListing(
        string memory propertyId,
        uint256 reservePrice,
        uint256 minIncrement,
        uint256 buyNowPrice,
        uint256 biddingDuration,
        address agent
    ) external returns (uint256 listingId) {
        require(bytes(propertyId).length > 0, "Property id required");
        require(reservePrice > 0, "Reserve price required");
        require(biddingDuration >= 5 minutes, "Bidding duration too short");
        require(minIncrement > 0, "Min increment required");
        require(
            titleRegistry.verifyOwnership(propertyId, msg.sender),
            "Sender not property owner"
        );
        require(titleRegistry.isVerified(propertyId), "Property not verified");
        require(activeListingForProperty[propertyId] == 0, "Property already listed");
        if (buyNowPrice > 0) {
            require(buyNowPrice >= reservePrice, "Buy now < reserve");
        }

        listingId = ++listingCount;
        listings[listingId] = Listing({
            propertyId: propertyId,
            seller: msg.sender,
            agent: agent,
            biddingEnd: uint64(block.timestamp + biddingDuration),
            escrowDeadline: 0,
            createdAt: uint64(block.timestamp),
            reservePrice: uint128(reservePrice),
            minIncrement: uint128(minIncrement),
            buyNowPrice: uint128(buyNowPrice),
            highestBid: 0,
            highestBidder: address(0),
            state: EscrowState.Auction,
            exists: true
        });
        activeListingForProperty[propertyId] = listingId;

        emit ListingCreated(
            listingId,
            propertyId,
            msg.sender,
            reservePrice,
            block.timestamp + biddingDuration
        );
    }

    /// @notice buyers place bids; previous leader's funds become withdrawable
    function placeBid(uint256 listingId) external payable listingExists(listingId) {
        Listing storage listing = listings[listingId];
        require(listing.state == EscrowState.Auction, "Auction closed");
        require(block.timestamp < listing.biddingEnd, "Auction ended");

        uint256 minBid = listing.highestBid == 0
            ? listing.reservePrice
            : listing.highestBid + listing.minIncrement;
        require(msg.value >= minBid, "Bid too low");

        address previousBidder = listing.highestBidder;
        uint256 previousBid = listing.highestBid;

        listing.highestBidder = msg.sender;
        listing.highestBid = msg.value;

        if (previousBidder != address(0)) {
            pendingReturns[listingId][previousBidder] += previousBid;
        }

        if (
            antiSnipingWindow > 0 &&
            listing.biddingEnd > block.timestamp &&
            listing.biddingEnd - block.timestamp <= antiSnipingWindow
        ) {
            uint256 newEnd = uint256(listing.biddingEnd) + uint256(antiSnipingExtension);
            require(newEnd <= type(uint64).max, "Bidding end overflow");
            listing.biddingEnd = uint64(newEnd);
        }

        emit BidPlaced(listingId, msg.sender, msg.value);

        if (listing.buyNowPrice > 0 && msg.value >= listing.buyNowPrice) {
            _autoStartEscrow(listingId);
        }
    }

    /// @notice bidders who have been outbid withdraw their escrowed ETH
    function withdrawBid(uint256 listingId) external nonReentrant listingExists(listingId) {
        uint256 amount = pendingReturns[listingId][msg.sender];
        require(amount > 0, "Nothing to withdraw");

        pendingReturns[listingId][msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Withdraw failed");

        emit BidWithdrawn(listingId, msg.sender, amount);
    }

    /// @notice sellers can cancel a listing before any bids are placed
    function cancelListing(uint256 listingId) external listingExists(listingId) {
        Listing storage listing = listings[listingId];
        require(listing.seller == msg.sender, "Only seller");
        require(listing.state == EscrowState.Auction, "Cannot cancel now");
        require(listing.highestBid == 0, "Already has bids");

        listing.state = EscrowState.Cancelled;
        activeListingForProperty[listing.propertyId] = 0;
        emit ListingCancelled(listingId);
    }

    /// @notice transitions the listing into escrow once bidding time has elapsed
    function finalizeAuction(uint256 listingId) external listingExists(listingId) {
        Listing storage listing = listings[listingId];
        require(listing.state == EscrowState.Auction, "Already finalized");
        require(block.timestamp >= listing.biddingEnd, "Auction still running");

        if (listing.highestBidder == address(0)) {
            listing.state = EscrowState.Cancelled;
            activeListingForProperty[listing.propertyId] = 0;
            emit ListingCancelled(listingId);
            return;
        }

        _startEscrow(listingId);
    }

    /// @notice called after the seller has transferred title to the winning bidder
    function completeEscrow(uint256 listingId)
        external
        nonReentrant
        listingExists(listingId)
    {
        Listing storage listing = listings[listingId];
        require(listing.state == EscrowState.AwaitingTitleTransfer, "Escrow inactive");
        require(
            titleRegistry.verifyOwnership(listing.propertyId, listing.highestBidder),
            "Buyer not owner yet"
        );
        require(listing.highestBid > 0, "No funds locked");

        listing.state = EscrowState.Completed;
        uint256 total = listing.highestBid;
        listing.highestBid = 0;

        uint256 commission = 0;
        if (listing.agent != address(0)) {
            commission = (total * commissionContract.commissionBps()) / 10000;
            if (commission > 0) {
                (bool ok, ) = address(commissionContract).call{value: commission}(
                    abi.encodeWithSignature(
                        "recordCommission(address,uint256)",
                        listing.agent,
                        total
                    )
                );
                require(ok, "Commission payment failed");
            }
        }

        uint256 sellerProceeds = total - commission;
        (bool sent, ) = payable(listing.seller).call{value: sellerProceeds}("");
        require(sent, "Seller payout failed");

        activeListingForProperty[listing.propertyId] = 0;
        emit EscrowCompleted(listingId, listing.highestBidder, total);
    }

    /// @notice winning bidder can reclaim funds if the seller misses the escrow deadline
    function claimEscrowRefund(uint256 listingId)
        external
        nonReentrant
        listingExists(listingId)
    {
        Listing storage listing = listings[listingId];
        require(listing.state == EscrowState.AwaitingTitleTransfer, "Escrow inactive");
        require(block.timestamp > listing.escrowDeadline, "Escrow still pending");
        address winner = listing.highestBidder;
        require(winner != address(0), "No winner");

        listing.state = EscrowState.Refunded;
        uint256 refund = listing.highestBid;
        listing.highestBid = 0;

        (bool ok, ) = payable(winner).call{value: refund}("");
        require(ok, "Refund failed");

        activeListingForProperty[listing.propertyId] = 0;
        emit EscrowRefunded(listingId, winner, refund);
    }

    function previewEscrowAction(uint256 listingId)
        external
        view
        listingExists(listingId)
        returns (bool canRelease, bool canRefund, uint256 timeRemaining)
    {
        Listing storage listing = listings[listingId];
        if (listing.state != EscrowState.AwaitingTitleTransfer) {
            return (false, false, 0);
        }
        bool ownershipOk = titleRegistry.verifyOwnership(listing.propertyId, listing.highestBidder);
        bool pastDeadline = block.timestamp > listing.escrowDeadline;
        uint256 remaining = listing.escrowDeadline > block.timestamp
            ? listing.escrowDeadline - block.timestamp
            : 0;
        return (ownershipOk, pastDeadline, remaining);
    }

    /// @notice helper for front-end state queries
    function getListing(uint256 listingId)
        external
        view
        listingExists(listingId)
        returns (Listing memory listing)
    {
        listing = listings[listingId];
    }

    function totalListings() external view returns (uint256) {
        return listingCount;
    }
    function _startEscrow(uint256 listingId) internal {
        Listing storage listing = listings[listingId];
        listing.state = EscrowState.AwaitingTitleTransfer;
        listing.escrowDeadline = uint64(block.timestamp + escrowDuration);
        emit AuctionFinalized(listingId, listing.highestBidder, listing.highestBid);
    }

    function _autoStartEscrow(uint256 listingId) internal {
        Listing storage listing = listings[listingId];
        listing.biddingEnd = uint64(block.timestamp);
        _startEscrow(listingId);
    }
}
