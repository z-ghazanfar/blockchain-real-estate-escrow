// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TitleRegistry.sol";
import "./AgentCommission.sol";

contract Escrow {
    enum EscrowState { NotFunded, Funded, Completed, Refunded }

    TitleRegistry public titleRegistry;
    AgentCommission public commissionContract;

    uint256 public propertyId;
    address public buyer;
    address public seller;
    address public agent;

    uint256 public amount;        // total sale price (ETH)
    EscrowState public state;

    constructor(
        uint256 _propertyId,
        address _buyer,
        address _seller,
        address _agent,
        address _titleRegistry,
        address _commissionContract
    ) {
        propertyId = _propertyId;
        buyer = _buyer;
        seller = _seller;
        agent = _agent;
        titleRegistry = TitleRegistry(_titleRegistry);
        commissionContract = AgentCommission(_commissionContract);
        state = EscrowState.NotFunded;
    }

    /// @notice buyer deposits the full purchase amount into escrow
    function depositFunds() external payable {
        require(msg.sender == buyer, "Only buyer can deposit");
        require(state == EscrowState.NotFunded, "Already funded");
        require(msg.value > 0, "Must deposit > 0");

        amount = msg.value;
        state = EscrowState.Funded;
    }

    /// @notice releases funds to seller + commission to agent
    /// requires that the TitleRegistry shows the buyer as current owner
    function releaseFunds() external {
        require(state == EscrowState.Funded, "Not in funded state");
        require(
            titleRegistry.verifyOwnership(propertyId, buyer),
            "Property not yet owned by buyer"
        );

        state = EscrowState.Completed;

        // calculate commission and seller payout
        uint256 commission = (amount * commissionContract.commissionBps()) / 10000;
        uint256 sellerAmount = amount - commission;

        // pay commission into AgentCommission contract
        (bool ok1, ) = address(commissionContract).call{value: commission}(
            abi.encodeWithSignature(
                "recordCommission(address,uint256)",
                agent,
                amount
            )
        );
        require(ok1, "Commission payment failed");

        // pay remaining amount to seller
        (bool ok2, ) = payable(seller).call{value: sellerAmount}("");
        require(ok2, "Payout to seller failed");
    }

    /// @notice refunds buyer if deal is cancelled before completion
    function refundBuyer() external {
        require(state == EscrowState.Funded, "Refund not available");
        require(msg.sender == buyer, "Only buyer can request refund");

        state = EscrowState.Refunded;

        uint256 refundAmount = amount;
        amount = 0;

        (bool ok, ) = payable(buyer).call{value: refundAmount}("");
        require(ok, "Refund failed");
    }

    /// @notice a convenience function to see current state as string (for demo)
    function viewStatus() external view returns (string memory) {
        if (state == EscrowState.NotFunded) return "NotFunded";
        if (state == EscrowState.Funded) return "Funded";
        if (state == EscrowState.Completed) return "Completed";
        return "Refunded";
    }
}