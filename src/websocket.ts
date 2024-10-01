import { Connection, PublicKey } from '@solana/web3.js';
import { executeTransaction } from './main.js';
import logger from './logger.js';
import dotenv from 'dotenv';
import { LiquidityPoolInfo, LiquidityPoolKeys, MAINNET_PROGRAM_ID } from '@raydium-io/raydium-sdk';

dotenv.config();

const RAYDIUM_PUBLIC_KEY = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const HTTP_URL = `https://${process.env.SOLANA_URL}/`;
const WSS_URL = `wss://${process.env.SOLANA_URL}/`;
const RAYDIUM = new PublicKey(RAYDIUM_PUBLIC_KEY);
const INSTRUCTION_NAME = 'initialize2';
const SOL_TO_TRADE = process.env.SOL_TO_TRADE;
const connection = new Connection(HTTP_URL, {
    wsEndpoint: WSS_URL,
});

let processedSignatures = false;

async function handleNewToken(
    swapAmountIn: number,
    tokenAccount: string,
    ammId: string,
    poolKeys: LiquidityPoolKeys,
    poolInfo: LiquidityPoolInfo,
    newTokenAccount: PublicKey
): Promise<void> {
    let response = null;
    while (!response) {
        logger.info('Executing transaction to sell new token...', {
            swapAmountIn,
            tokenAccount,
            ammId,
            poolKeys,
            poolInfo,
            newTokenAccount,
        });
        response = await executeTransaction(
            swapAmountIn / 1000000,
            'So11111111111111111111111111111111111111112',
            ammId
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log('Response:', response);
        // response = await executeTransactionSellingNewToken(
        //     swapAmountIn,
        //     tokenAccount,
        //     ammId,
        //     poolKeys,
        //     poolInfo,
        //     newTokenAccount
        // );
    }
}
async function streamNewPools(connection: Connection, programAddress: PublicKey): Promise<void> {
    const streamProgramPublicKey = programAddress.toString();
    console.log('Stream Program Public Key:', streamProgramPublicKey);
    logger.info('Monitoring logs for program:', { streamProgramPublicKey });

    connection.onLogs(programAddress, async ({ logs, err, signature }) => {
        if (err) return;

        if (logs && logs.some((log) => log.includes(INSTRUCTION_NAME))) {
            if (processedSignatures === true) {
                logger.debug(`Already processing a signature. Skipping...`, { signature });
                return;
            }
            processedSignatures = true;
            logger.info("Signature for 'initialize2':", `https://solscan.io/tx/${signature}`);
            const mintData = await fetchRaydiumMints(signature, connection);
            if (mintData === null) {
                processedSignatures = false;
                return;
            }
            const response = await executeTransaction(
                SOL_TO_TRADE,
                mintData.tokenAccount,
                mintData.ammId
            );
            if (!response) {
                processedSignatures = false;
                return;
            }
            const { tokensInBalance, poolKeys, poolInfo, tokenOutAccount } = response;
            await handleNewToken(
                tokensInBalance,
                mintData.tokenAccount,
                mintData.ammId,
                poolKeys,
                poolInfo,
                tokenOutAccount
            );
            processedSignatures = false;
        }
    });
}

async function fetchRaydiumMints(
    txId: string,
    connection: Connection
): Promise<{ ammId: string; tokenAccount: string } | null> {
    try {
        const tx = await connection.getParsedTransaction(txId, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
        });

        const accounts = (tx?.transaction.message.instructions as any[]).find(
            (ix) => ix.programId.toBase58() === RAYDIUM_PUBLIC_KEY
        )?.accounts as PublicKey[];

        if (!accounts) {
            logger.info('No accounts found in the transaction.');
            return null;
        }

        const tokenAIndex = 8;
        const tokenBIndex = 9;
        const ammdIdIndex = 4;

        const tokenAAccount = accounts[tokenAIndex];
        const tokenBAccount = accounts[tokenBIndex];
        let ammId = accounts[ammdIdIndex].toString();
        if (ammId.startsWith('Sysvar')) {
            ammId = accounts[ammdIdIndex + 1].toString();
        }
        console.log('ammId:', ammId);
        const displayData = [
            { Token: 'A', 'Account Public Key': tokenAAccount.toBase58() },
            { Token: 'B', 'Account Public Key': tokenBAccount.toBase58() },
        ];

        console.log('Display Data:', displayData);
        let tokenAccount;
        if (tokenAAccount.toBase58() !== 'So11111111111111111111111111111111111111112') {
            tokenAccount = tokenAAccount.toBase58();
        } else if (tokenBAccount.toBase58() !== 'So11111111111111111111111111111111111111112') {
            tokenAccount = tokenBAccount.toBase58();
        } else {
            return null;
        }
        logger.info('AMM ID:', { ammId });
        logger.info('Token Account:', { tokenAccount });
        return { ammId, tokenAccount };
    } catch (error) {
        logger.error('Error fetching transaction:', { txId, error });
        return null;
    }
}

streamNewPools(connection, RAYDIUM).catch(console.error);
