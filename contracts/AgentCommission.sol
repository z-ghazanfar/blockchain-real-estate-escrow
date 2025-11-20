// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentCommission {
    // commission in basis points (e.g. 300 = 3%)
    uint256 public commissionBps = 300;

    mapping(address => uint256) public commissionBalance;

    /// @notice called by the Escrow contract. msg.value must equal commission amount.
    function recordCommission(address agent, uint256 saleAmount) external payable {
        uint256 expected = (saleAmount * commissionBps) / 10000;
        require(msg.value == expected, "Incorrect commission value");
        commissionBalance[agent] += msg.value;
    }

    /// @notice agent withdraws their accumulated commission
    function releaseCommission(address payable agent) external {
        uint256 amount = commissionBalance[agent];
        require(amount > 0, "No commission to withdraw");
        commissionBalance[agent] = 0;

        (bool ok, ) = agent.call{value: amount}("");
        require(ok, "Transfer failed");
    }

    /// @notice helper for view
    function getCommissionBalance(address agent) external view returns (uint256) {
        return commissionBalance[agent];
    }
}