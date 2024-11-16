import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";

interface HardhatArtifact {
    _format: string;
    contractName: string;
    sourceName: string;
    abi: any[];
    bytecode: string;
    deployedBytecode: string;
    linkReferences: Record<string, any>;
    deployedLinkReferences: Record<string, any>;
}

function extractAbi(artifactPath: string, outputPath: string): void {
    try {
        // Read and parse the artifact file
        const artifact: HardhatArtifact = JSON.parse(
            readFileSync(artifactPath, "utf8")
        );

        // Extract the ABI
        const abi = artifact.abi;

        // Write the ABI to a new file
        writeFileSync(outputPath, JSON.stringify(abi, null, 2));

        console.log(`ABI extracted to: ${outputPath}`);
    } catch (error) {
        console.error(
            "Error extracting ABI:",
            error instanceof Error ? error.message : error
        );
        process.exit(1);
    }
}

// Get command line arguments
const artifactPath = process.argv[2];
const outputPath = process.argv[3] || join(dirname(artifactPath), "abi.json");

if (!artifactPath) {
    console.error(
        "Please provide the path to the artifact file as an argument"
    );
    process.exit(1);
}

extractAbi(artifactPath, outputPath);
