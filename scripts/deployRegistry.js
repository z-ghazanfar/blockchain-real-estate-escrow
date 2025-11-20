import { ethers } from "ethers";
import hardhat from "hardhat";

async function main() {
  const verifier = process.env.VERIFIER_ADDRESS;
  if (!verifier) {
    throw new Error("Set VERIFIER_ADDRESS in your environment before deploying.");
  }
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpcUrl || !deployerKey) {
    throw new Error("SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY must be set.");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(deployerKey, provider);
  const artifact = await hardhat.artifacts.readArtifact("TitleRegistry");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const registry = await factory.deploy(verifier);
  await registry.waitForDeployment();

  console.log("TitleRegistry deployed to:", await registry.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
