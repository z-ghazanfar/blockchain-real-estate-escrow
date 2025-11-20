// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TitleRegistry {
    enum VerificationStatus {
        None,
        Pending,
        Verified,
        Rejected
    }

    struct Property {
        address owner;
        string metadataURI;
        string evidenceURI;
        VerificationStatus status;
        bool exists;
    }

    mapping(string => Property) private properties;

    address public registryAdmin;
    address public verifier;

    event PropertyRegistered(string indexed propertyId, address indexed owner, string metadataURI);
    event OwnershipTransferred(
        string indexed propertyId,
        address indexed previousOwner,
        address indexed newOwner
    );
    event VerificationRequested(string indexed propertyId, address indexed requester, string metadataURI);
    event VerificationResolved(
        string indexed propertyId,
        VerificationStatus status,
        string evidenceURI
    );

    modifier onlyAdmin() {
        require(msg.sender == registryAdmin, "Not registry admin");
        _;
    }

    modifier onlyVerifier() {
        require(msg.sender == verifier, "Not verifier");
        _;
    }

    constructor(address _verifier) {
        require(_verifier != address(0), "Verifier required");
        registryAdmin = msg.sender;
        verifier = _verifier;
    }

    /// @notice seller registers a property and triggers an off-chain verification workflow
    function registerProperty(string memory propertyId, string memory metadataURI) external {
        require(bytes(propertyId).length > 0, "Property id required");
        require(bytes(metadataURI).length > 0, "Metadata required");
        Property storage existing = properties[propertyId];
        require(!existing.exists, "Already registered");

        properties[propertyId] = Property({
            owner: msg.sender,
            metadataURI: metadataURI,
            evidenceURI: "",
            status: VerificationStatus.Pending,
            exists: true
        });

        emit PropertyRegistered(propertyId, msg.sender, metadataURI);
        emit VerificationRequested(propertyId, msg.sender, metadataURI);
    }

    /// @notice owner can resubmit to trigger another verification scrape/check
    function requestReverification(string memory propertyId) external {
        Property storage property = properties[propertyId];
        require(property.exists, "Not registered");
        require(msg.sender == property.owner, "Only owner");

        property.status = VerificationStatus.Pending;
        property.evidenceURI = "";
        emit VerificationRequested(propertyId, msg.sender, property.metadataURI);
    }

    /// @notice off-chain verifier writes back the result of a registry scrape
    function recordVerificationResult(
        string memory propertyId,
        bool propertyExists,
        string memory evidenceURI
    ) external onlyVerifier {
        Property storage property = properties[propertyId];
        require(property.exists, "Not registered");

        property.status = propertyExists ? VerificationStatus.Verified : VerificationStatus.Rejected;
        property.evidenceURI = evidenceURI;
        emit VerificationResolved(propertyId, property.status, evidenceURI);
    }

    /// @notice owner can update descriptive metadata (e.g., IPFS doc)
    function updateMetadata(string memory propertyId, string memory metadataURI) external {
        Property storage property = properties[propertyId];
        require(property.exists, "Not registered");
        require(msg.sender == property.owner, "Only owner");
        require(bytes(metadataURI).length > 0, "Metadata required");

        property.metadataURI = metadataURI;
        // metadata updates do not change verification status automatically
    }

    /// @notice transfers title to a new owner
    function transferOwnership(string memory propertyId, address newOwner) external {
        Property storage property = properties[propertyId];
        require(property.exists, "Not registered");
        require(msg.sender == property.owner, "Only owner");
        require(newOwner != address(0), "New owner zero address");

        address previousOwner = property.owner;
        property.owner = newOwner;
        emit OwnershipTransferred(propertyId, previousOwner, newOwner);
    }

    /// @notice checks to see if claimedOwner currently owns propertyId
    function verifyOwnership(string memory propertyId, address claimedOwner)
        external
        view
        returns (bool)
    {
        Property storage property = properties[propertyId];
        if (!property.exists) {
            return false;
        }
        return property.owner == claimedOwner;
    }

    function ownerOf(string memory propertyId) external view returns (address) {
        Property storage property = properties[propertyId];
        require(property.exists, "Not registered");
        return property.owner;
    }

    function isVerified(string memory propertyId) external view returns (bool) {
        Property storage property = properties[propertyId];
        if (!property.exists) {
            return false;
        }
        return property.status == VerificationStatus.Verified;
    }

    function propertyInfo(string memory propertyId)
        external
        view
        returns (
            address owner,
            string memory metadataURI,
            VerificationStatus status,
            string memory evidenceURI,
            bool exists
        )
    {
        Property storage property = properties[propertyId];
        return (property.owner, property.metadataURI, property.status, property.evidenceURI, property.exists);
    }

    function setVerifier(address newVerifier) external onlyAdmin {
        require(newVerifier != address(0), "Verifier required");
        verifier = newVerifier;
    }

    function transferRegistryAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Admin required");
        registryAdmin = newAdmin;
    }
}
