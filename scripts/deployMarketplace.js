import { ethers } from "ethers";
import hardhat from "hardhat";

async function main() {
  const {
    TITLE_REGISTRY_ADDRESS,
    AGENT_COMMISSION_ADDRESS,
    ESCROW_DURATION_SECONDS,
    ANTI_SNIPING_WINDOW,
    ANTI_SNIPING_EXTENSION
  } = process.env;

  if (!TITLE_REGISTRY_ADDRESS) {
    throw new Error("Set TITLE_REGISTRY_ADDRESS before deploying the marketplace.");
  }
  if (!AGENT_COMMISSION_ADDRESS) {
    throw new Error("Set AGENT_COMMISSION_ADDRESS before deploying the marketplace.");
  }
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpcUrl || !deployerKey) {
    throw new Error("SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY must be set.");
  }

  const duration = ESCROW_DURATION_SECONDS || "604800";
  const window = ANTI_SNIPING_WINDOW || "300";
  const extension = ANTI_SNIPING_EXTENSION || "300";

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(deployerKey, provider);
  const artifact = await hardhat.artifacts.readArtifact("TransactifyMarketplace");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const market = await factory.deploy(
    TITLE_REGISTRY_ADDRESS,
    AGENT_COMMISSION_ADDRESS,
    duration,
    window,
    extension
  );
  await market.waitForDeployment();

  console.log("TransactifyMarketplace deployed to:", await market.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
