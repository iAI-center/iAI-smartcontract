import "@nomicfoundation/hardhat-toolbox";
import { writeFileSync } from "fs";
import { task, types } from "hardhat/config";

interface TaskArgs {
  files: string[];
  out?: string;
}

task(
  "flatten2",
  "Flattens and prints contracts and their dependencies (Resolves licenses)"
)
  .addOptionalVariadicPositionalParam(
    "files",
    "The files to flatten",
    undefined,
    types.inputFile
  )
  .addOptionalParam("out", "output flatten file")
  .setAction(async (args: TaskArgs, hre) => {
    let flattened = await hre.run("flatten:get-flattened-sources", {
      files: args.files,
    });

    // Remove every line started with "// SPDX-License-Identifier:"
    flattened = flattened.replace(
      /SPDX-License-Identifier:/gm,
      "License-Identifier:"
    );
    flattened = `// SPDX-License-Identifier: MIXED\n\n${flattened}`;

    // Remove every line started with "pragma experimental ABIEncoderV2;" except the first one
    flattened = flattened.replace(
      /pragma experimental ABIEncoderV2;\n/gm,
      (
        (i) => (m: any) =>
          !i++ ? m : ""
      )(0)
    );

    if (args.out) {
      writeFileSync(args.out, flattened);
    } else {
      // write to stdout
      process.stdout.write(flattened);
    }
  });
