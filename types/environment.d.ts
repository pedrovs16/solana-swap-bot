declare namespace NodeJS {
    interface ProcessEnv {
        SOLANA_WALLET: string;
        ASSOCIATED_TOKEN_SOL_WALLET: string;
        SOLANA_URL: string;
        SOL_TO_TRADE: number;
    }
}
