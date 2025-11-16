// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TitleRegistry {
    struct Property {
        address owner;
        bool exists;
    }

    mapping(uint256 => Property) public properties;

    /// @notice registers a new property with an initial owner
    function registerProperty(uint256 propertyId, address owner) external {
        require(!properties[propertyId].exists, "Already registered");
        properties[propertyId] = Property({
            owner: owner,
            exists: true
        });
    }

    /// @notice transfers to a new owner (only current owner can do this)
    function transferOwnership(uint256 propertyId, address newOwner) external {
        require(properties[propertyId].exists, "Not registered");
        require(msg.sender == properties[propertyId].owner, "Only owner");
        properties[propertyId].owner = newOwner;
    }

    /// @notice checks to see if claimedOwner currently owns propertyId
    function verifyOwnership(uint256 propertyId, address claimedOwner)
        external
        view
        returns (bool)
    {
        if (!properties[propertyId].exists) {
            return false;
        }
        return properties[propertyId].owner == claimedOwner;
    }
}