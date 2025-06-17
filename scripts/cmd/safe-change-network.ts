import prompts from "prompts";
import cliHelper from "./cli-helper";
import hre from "hardhat";

export enum SupportNetworks {
    baseMainnet = "baseMainnet",
    forkingBaseMainnet = "forkingBaseMainnet",
    forkingPolygonMainnet = "forkingPolygonMainnet",
    forkingPolygonTestnet = "forkingPolygonTestnet",
    polygonMainnet = "polygonMainnet",
    polygonTestnet = "polygonTestnet",
}

const requiredPinNetworks: SupportNetworks[] = [
    // SupportNetworks.soneiumMainnet,
    // SupportNetworks.ethereumMainnet,
    SupportNetworks.polygonMainnet,
    SupportNetworks.baseMainnet,
];

export async function safeChangeNetwork(n: SupportNetworks) {
    console.log("changing network to ", n);
    if (requiredPinNetworks.includes(n)) {
        if (!(await cliHelper.confirmNetworkChanedPromptMessage(n))) {
            process.exit(1);
        }
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        const enterPin = await cliHelper.inputPrompt(`enter pin (${pin}): `);
        if (pin !== enterPin) {
            console.log("pin not match ...aborted");
            process.exit(1);
        }
    }
    await hre.switchNetwork(n);
}

export async function promptSafeChangeNetwork(
    n: SupportNetworks[]
): Promise<SupportNetworks> {
    const selectedNetwork = await prompts({
        type: "select",
        name: "network",
        message: "Select a network to change to:",
        choices: n.map((network) => ({
            title: network,
            value: network,
        })),
    });
    if (
        selectedNetwork.network &&
        Object.values(SupportNetworks).includes(selectedNetwork.network)
    ) {
        await safeChangeNetwork(selectedNetwork.network as SupportNetworks);
    } else {
        console.log(
            `No network selected, or an invalid selected value ${selectedNetwork.network}. Exiting...`
        );
        process.exit(1);
    }
    return selectedNetwork.network;
}
