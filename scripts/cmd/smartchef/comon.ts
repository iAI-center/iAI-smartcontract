import cliHelper from "../cli-helper";
import path from "path";

export function makeOutDir(network: string, subDir: string[]): string {
    // make output dir ...
    const outDir = path.join(
        ".",
        "out",
        network,
        ...[...subDir, `${+new Date()}`]
    );
    cliHelper.ensureDirExists(outDir);
    return outDir;
}

export type DelayStrategy = (attempt: number) => number;

const defaultDelay: DelayStrategy = (attempt) =>
    Math.min(1000 * Math.pow(2, attempt - 1), 30000);

type AsyncFunction<T> = () => Promise<T>;

class RetryBuilder<T> {
    private maxAttempts = 3;
    private delayStrategy: DelayStrategy = defaultDelay;
    private readonly fn: AsyncFunction<T>;

    constructor(fn: AsyncFunction<T>) {
        this.fn = fn;
    }

    withMaxAttempt(attempts: number): RetryBuilder<T> {
        this.maxAttempts = attempts;
        return this;
    }

    /**
     * Sets the delay strategy between retry attempts
     * @param delayMs - The delay in milliseconds or a function that returns the delay
     * @returns The current RetryBuilder instance for method chaining
     */
    withDelay(delayMs: number | DelayStrategy): RetryBuilder<T> {
        this.delayStrategy =
            typeof delayMs === "function" ? delayMs : () => delayMs;
        return this;
    }

    max(n: number): RetryBuilder<T> {
        return this.withMaxAttempt(n);
    }

    async do(): Promise<T> {
        let lastError: any;
        while (true) {
            // Changed to infinite loop to allow multiple retry cycles
            for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
                try {
                    return await this.fn();
                } catch (error) {
                    lastError = error;
                    const delay = this.delayStrategy(attempt);
                    const errorMessage =
                        error instanceof Error ? error.message : String(error);
                    console.log(
                        `Attempt ${attempt}/${this.maxAttempts} failed: ${errorMessage}`
                    );
                    if (attempt < this.maxAttempts) {
                        console.log(`Waiting ${delay}ms before retry...`);
                        await new Promise((resolve) =>
                            setTimeout(resolve, delay)
                        );
                    }
                }
            }

            // After max attempts reached, ask user what to do
            const tryAgain = await cliHelper.confirmPromptMessage(
                "Max attempts reached. Would you like to try again?"
            );

            if (!tryAgain) {
                throw lastError;
            }
            console.log("Restarting retry cycle...");
        }
    }
}

export function doRetry<T>(fn: AsyncFunction<T>): RetryBuilder<T> {
    return new RetryBuilder<T>(fn);
}

export async function retry<T>(
    fn: () => Promise<T>,
    retries: number = 5,
    delayMs?: number | DelayStrategy
): Promise<T> {
    const getDelay =
        typeof delayMs === "function"
            ? delayMs
            : typeof delayMs === "number"
            ? () => delayMs
            : defaultDelay;

    while (true) {
        // Changed to infinite loop to allow multiple retry cycles
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : String(error);
                console.log(
                    `Attempt ${attempt}/${retries} failed: ${errorMessage}`
                );

                // Log the stack trace if available
                if (error instanceof Error && error.stack) {
                    console.log(`Stack trace:\n${error.stack}`);
                } else {
                    console.log("No stack trace available");
                }

                if (attempt === retries) {
                    const tryAgain = await cliHelper.confirmPromptMessage(
                        "Max attempts reached. Would you like to try again?"
                    );
                    if (!tryAgain) {
                        throw error;
                    }
                    console.log("Restarting retry cycle...");
                    continue;
                }

                const delay = getDelay(attempt);
                console.log(`Waiting ${delay}ms before retry...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw new Error("Unexpected error during retry.");
}
