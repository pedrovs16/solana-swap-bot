import {
    LIQUIDITY_STATE_LAYOUT_V4,
    LiquidityPoolKeys,
    MAINNET_PROGRAM_ID,
    MARKET_STATE_LAYOUT_V3,
    LiquidityPoolInfo,
    TOKEN_PROGRAM_ID,
    Token,
    TokenAmount,
    Percent,
    Liquidity,
    WSOL,
} from '@raydium-io/raydium-sdk';
import {
    createSyncNativeInstruction,
    getOrCreateAssociatedTokenAccount,
    NATIVE_MINT,
} from '@solana/spl-token';
import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';

const BN = require('bn.js');

const ASSOCIATED_TOKEN_SOL_WALLET = new PublicKey('Dsb9A5NuufLgdigpWnC6LXrjCyjG9RcWyN1fbpF2vGuv'); // TODO: Make it a env var
const getPoolKeys = async (ammId: string, connection: Connection) => {
    const ammAccount = await connection.getAccountInfo(new PublicKey(ammId));
    if (ammAccount) {
        const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(ammAccount.data);
        const marketAccount = await connection.getAccountInfo(poolState.marketId);
        if (marketAccount) {
            const marketState = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
            const marketAuthority = PublicKey.createProgramAddressSync(
                [
                    marketState.ownAddress.toBuffer(),
                    marketState.vaultSignerNonce.toArrayLike(Buffer, 'le', 8),
                ],
                MAINNET_PROGRAM_ID.OPENBOOK_MARKET
            );
            return {
                id: new PublicKey(ammId),
                programId: MAINNET_PROGRAM_ID.AmmV4,
                status: poolState.status,
                baseDecimals: poolState.baseDecimal.toNumber(),
                quoteDecimals: poolState.quoteDecimal.toNumber(),
                lpDecimals: 9,
                baseMint: poolState.baseMint,
                quoteMint: poolState.quoteMint,
                version: 4,
                authority: new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'),
                openOrders: poolState.openOrders,
                baseVault: poolState.baseVault,
                quoteVault: poolState.quoteVault,
                marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
                marketId: marketState.ownAddress,
                marketBids: marketState.bids,
                marketAsks: marketState.asks,
                marketEventQueue: marketState.eventQueue,
                marketBaseVault: marketState.baseVault,
                marketQuoteVault: marketState.quoteVault,
                marketAuthority: marketAuthority,
                targetOrders: poolState.targetOrders,
                lpMint: poolState.lpMint,
            } as unknown as LiquidityPoolKeys;
        }
    }
};

const calculateAmountOut = async (
    poolKeys: LiquidityPoolKeys,
    poolInfo: LiquidityPoolInfo,
    tokenToBuy: string,
    amountIn: number,
    rawSlippage: number
) => {
    let tokenOutMint = new PublicKey(tokenToBuy);
    let tokenOutDecimals = poolKeys.baseMint.equals(tokenOutMint)
        ? poolInfo.baseDecimals
        : poolKeys.quoteDecimals;
    let tokenInMint = poolKeys.baseMint.equals(tokenOutMint)
        ? poolKeys.quoteMint
        : poolKeys.baseMint;
    let tokenInDecimals = poolKeys.baseMint.equals(tokenOutMint)
        ? poolInfo.quoteDecimals
        : poolInfo.baseDecimals;

    const tokenIn = new Token(TOKEN_PROGRAM_ID, tokenInMint, tokenInDecimals);
    const tknAmountIn = new TokenAmount(tokenIn, amountIn, false);
    const tokenOut = new Token(TOKEN_PROGRAM_ID, tokenOutMint, tokenOutDecimals);
    const slippage = new Percent(rawSlippage, 100);
    return {
        amountIn: tknAmountIn,
        tokenIn: tokenInMint,
        tokenOut: tokenOutMint,
        ...Liquidity.computeAmountOut({
            poolKeys,
            poolInfo,
            amountIn: tknAmountIn,
            currencyOut: tokenOut,
            slippage,
        }),
    };
};

const makeSwapInstruction = async (
    connection: Connection,
    tokenToBuy: string,
    rawAmountIn: number,
    slippage: number,
    poolKeys: LiquidityPoolKeys,
    poolInfo: LiquidityPoolInfo,
    keyPair: Keypair
) => {
    console.log('Making Swap Instruction...');
    const { amountIn, tokenIn, tokenOut, minAmountOut } = await calculateAmountOut(
        poolKeys,
        poolInfo,
        tokenToBuy,
        rawAmountIn,
        slippage
    );
    let tokenInAccount: PublicKey;
    let tokenOutAccount: PublicKey;

    if (tokenIn.toString() == WSOL.mint) {
        console.log(111111111111);
        tokenInAccount = ASSOCIATED_TOKEN_SOL_WALLET;
        console.log(tokenInAccount);
        tokenOutAccount = (
            await getOrCreateAssociatedTokenAccount(
                connection,
                keyPair,
                tokenOut,
                keyPair.publicKey
            )
        ).address;
        console.log(tokenOutAccount);
    } else {
        console.log(5555555555);
        tokenOutAccount = ASSOCIATED_TOKEN_SOL_WALLET;
        console.log(6666666666);
        tokenInAccount = (
            await getOrCreateAssociatedTokenAccount(connection, keyPair, tokenIn, keyPair.publicKey)
        ).address;
        console.log(7777777777);
    }

    const ix = new TransactionInstruction({
        programId: new PublicKey(poolKeys.programId),
        keys: [
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: poolKeys.id, isSigner: false, isWritable: true },
            { pubkey: poolKeys.authority, isSigner: false, isWritable: false },
            { pubkey: poolKeys.openOrders, isSigner: false, isWritable: true },
            { pubkey: poolKeys.baseVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.quoteVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketProgramId, isSigner: false, isWritable: false },
            { pubkey: poolKeys.marketId, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketBids, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketAsks, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketEventQueue, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketBaseVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketQuoteVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketAuthority, isSigner: false, isWritable: false },
            { pubkey: tokenInAccount, isSigner: false, isWritable: true },
            { pubkey: tokenOutAccount, isSigner: false, isWritable: true },
            { pubkey: keyPair.publicKey, isSigner: true, isWritable: false },
        ],
        data: Buffer.from(
            Uint8Array.of(
                9,
                ...new BN(amountIn.raw).toArray('le', 8),
                ...new BN(minAmountOut.raw).toArray('le', 8)
            )
        ),
    });
    return {
        swapIX: ix,
        tokenInAccount: tokenInAccount,
        tokenOutAccount: tokenOutAccount,
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut,
    };
};

export const executeTransaction = async (
    swapAmountIn: number,
    tokenToBuy: string,
    ammId: string
) => {
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const secretKey = bs58.decode(
        '4uBeiZZxB9swkzuxeJ2uGm3jAiTFcoQtJarr5uDHZnFMiZEdMkSh9jGv32D3pcsNAk9Uwbp8YDPao7QTLTWGVzHB'
    );
    const keyPair = Keypair.fromSecretKey(secretKey);
    const slippage = 2; // 2% slippage tolerance

    const currentTime1 = new Date().toLocaleTimeString();
    console.log('Current Time1:', currentTime1);
    const poolKeys = await getPoolKeys(ammId, connection);
    const currentTime2 = new Date().toLocaleTimeString();
    console.log('Current Time2:', currentTime2);
    if (poolKeys) {
        const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });
        const currentTime3 = new Date().toLocaleTimeString();
        console.log('Current Time3:', currentTime3);
        const txn = new Transaction();
        const { swapIX, tokenInAccount, tokenIn, amountIn } = await makeSwapInstruction(
            connection,
            tokenToBuy,
            swapAmountIn,
            slippage,
            poolKeys,
            poolInfo,
            keyPair
        );
        const currentTime4 = new Date().toLocaleTimeString();
        console.log('Current Time4:', currentTime4);
        if (tokenIn.toString() == WSOL.mint) {
            // Convert SOL to Wrapped SOL
            txn.add(
                SystemProgram.transfer({
                    fromPubkey: keyPair.publicKey,
                    toPubkey: tokenInAccount,
                    lamports: amountIn.raw.toNumber(),
                }),
                createSyncNativeInstruction(tokenInAccount, TOKEN_PROGRAM_ID)
            );
        }
        txn.add(swapIX);
        const currentTime5 = new Date().toLocaleTimeString();
        console.log('Current Time5:', currentTime5);
        const hash = await sendAndConfirmTransaction(connection, txn, [keyPair], {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        });
        const currentTime6 = new Date().toLocaleTimeString();
        console.log('Current Time6:', currentTime6);
        console.log('Transaction Completed Successfully 🎉🚀.');
        console.log(`Explorer URL: https://solscan.io/tx/${hash}`);
    } else {
        console.log(`Could not get PoolKeys for AMM: ${ammId}`);
    }
};
