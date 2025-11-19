// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TitleRegistry {
    struct Property {
        address owner;
        bool exists;
    }

    mapping(string => Property) public properties;

    /// @notice registers a new property with an initial owner
    function registerProperty(string memory propertyName, address owner) external {
        require(!properties[propertyName].exists, "Already registered");
        properties[propertyName] = Property({
            owner: owner,
            exists: true
        });
    }

    /// @notice transfers to a new owner (only current owner can do this)
    function transferOwnership(string memory propertyName, address newOwner) external {
        require(properties[propertyName].exists, "Not registered");
        require(msg.sender == properties[propertyName].owner, "Only owner");
        properties[propertyName].owner = newOwner;
    }

    /// @notice checks to see if claimedOwner currently owns propertyName
    function verifyOwnership(string memory propertyName, address claimedOwner)
        external
        view
        returns (bool)
    {
        if (!properties[propertyName].exists) {
            return false;
        }
        return properties[propertyName].owner == claimedOwner;
    }
}