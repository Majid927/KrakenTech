const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================================
// SECURITY
// ======================================================

const JWT_SECRET =
    process.env.JWT_SECRET ||
    "KrakenCoin-Change-This-Secret-2026";

const ADMIN_SECRET =
    process.env.ADMIN_SECRET ||
    "KrakenCoin-Admin-Change-This-Secret-2026";

// ======================================================
// SETTINGS
// ======================================================

const WIN_PAYOUT = 0.80;
const MARKET_UPDATE_INTERVAL = 60000;
const DEFAULT_TRADE_DURATION = 30;

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());
app.use(express.json());

// ======================================================
// FILES
// ======================================================

const usersFile =
    path.join(
        __dirname,
        "users.json"
    );

const marketControlFile =
    path.join(
        __dirname,
        "market-control.json"
    );

const paymentSettingsFile =
    path.join(
        __dirname,
        "payment-settings.json"
    );

// ======================================================
// FRONTEND PATH
// ======================================================

const candidateFolders = [
    process.env.FRONTEND_DIR,
    path.join(__dirname, "public_html"),
    path.join(__dirname, "..", "public_html"),
    path.join(__dirname, "public"),
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "frontend"),
    path.join(__dirname, "..", "frontend"),
    path.join(__dirname, "..", "Microsoft VS Code", "tradex near to final"),
    path.join(__dirname, "..", "tradex near to final"),
    __dirname,
    path.join(__dirname, "..")
].filter(Boolean);

const FRONTEND_FOLDER =
    candidateFolders.find(dir =>
        fs.existsSync(path.join(dir, "index.html")) ||
        fs.existsSync(path.join(dir, "login.html"))
    ) || __dirname;

console.log(
    "Frontend folder:",
    FRONTEND_FOLDER
);

// ======================================================
// SERVE FRONTEND
// ======================================================

if (
    fs.existsSync(
        FRONTEND_FOLDER
    )
) {

    app.use(
        express.static(
            FRONTEND_FOLDER
        )
    );

} else {

    console.error(
        "WARNING: Frontend folder not found:",
        FRONTEND_FOLDER
    );

}

// ======================================================
// HELPERS
// ======================================================

function roundMoney(value) {

    return Number(
        Number(
            value || 0
        ).toFixed(2)
    );

}

function nowIso() {

    return new Date().toISOString();

}

// ======================================================
// USERS
// ======================================================

function getUsers() {

    if (
        !fs.existsSync(
            usersFile
        )
    ) {

        fs.writeFileSync(
            usersFile,
            "[]",
            "utf8"
        );

    }

    try {

        const raw =
            fs.readFileSync(
                usersFile,
                "utf8"
            );

        if (
            !raw.trim()
        ) {

            return [];

        }

        const users =
            JSON.parse(
                raw
            );

        return Array.isArray(
            users
        )
            ? users
            : [];

    } catch (error) {

        console.error(
            "users.json error:",
            error.message
        );

        return [];

    }

}

function saveUsers(
    users
) {

    fs.writeFileSync(
        usersFile,
        JSON.stringify(
            users,
            null,
            2
        ),
        "utf8"
    );

}

function findUser(
    users,
    userId
) {

    return users.find(
        user =>
            String(
                user.id
            ) ===
            String(
                userId
            )
    );

}

function normalizeUser(
    user
) {

    if (!user) {
        return user;
    }

    if (
        !Array.isArray(
            user.trades
        )
    ) {

        user.trades = [];

    }

    if (
        !Array.isArray(
            user.deposits
        )
    ) {

        user.deposits = [];

    }

    if (
        !Array.isArray(
            user.withdrawals
        )
    ) {

        user.withdrawals = [];

    }

    if (
        !Array.isArray(
            user.transactions
        )
    ) {

        user.transactions = [];

    }

    if (
        !Number.isFinite(
            Number(
                user.balance
            )
        )
    ) {

        user.balance = 0;

    }

    user.balance =
        roundMoney(
            user.balance
        );

    return user;

}

function publicUser(
    user
) {

    normalizeUser(
        user
    );

    return {

        id:
            user.id,

        name:
            user.name,

        email:
            user.email,

        phone:
            user.phone || "",

        balance:
            roundMoney(
                user.balance
            ),

        trades:
            user.trades,

        deposits:
            user.deposits,

        withdrawals:
            user.withdrawals,

        transactions:
            user.transactions,

        createdAt:
            user.createdAt || ""

    };

}

// ======================================================
// PAYMENT SETTINGS
// ======================================================
//
// User sees these details on deposit page.
// Admin can change them.
// Deposit itself does NOT automatically credit balance.
// Admin can manually add balance after checking payment.
//

const defaultPaymentSettings = {

    enabled:
        true,

    method:
        "Bank / Wallet",

    accountTitle:
        "KrakenCoin",

    accountNumber:
        "",

    walletAddress:
        "",

    network:
        "",

    instructions:
        "Make your payment using the details above and keep your payment reference.",

    minDeposit:
        1,

    maxDeposit:
        1000000,

    updatedAt:
        null

};

function getPaymentSettings() {

    try {

        if (
            !fs.existsSync(
                paymentSettingsFile
            )
        ) {

            fs.writeFileSync(
                paymentSettingsFile,
                JSON.stringify(
                    defaultPaymentSettings,
                    null,
                    2
                ),
                "utf8"
            );

            return {
                ...defaultPaymentSettings
            };

        }

        const raw =
            fs.readFileSync(
                paymentSettingsFile,
                "utf8"
            );

        if (
            !raw.trim()
        ) {

            return {
                ...defaultPaymentSettings
            };

        }

        const saved =
            JSON.parse(
                raw
            );

        return {

            ...defaultPaymentSettings,

            ...saved

        };

    } catch (error) {

        console.error(
            "Payment settings error:",
            error.message
        );

        return {
            ...defaultPaymentSettings
        };

    }

}

function savePaymentSettings(
    settings
) {

    fs.writeFileSync(
        paymentSettingsFile,
        JSON.stringify(
            settings,
            null,
            2
        ),
        "utf8"
    );

}

// ======================================================
// MARKET
// ======================================================

const COINS = {

    BTC:
        "bitcoin",

    ETH:
        "ethereum",

    BNB:
        "binancecoin",

    SOL:
        "solana",

    XRP:
        "ripple",

    ADA:
        "cardano"

};

const fallbackPrices = {

    BTC:
        118450,

    ETH:
        4300,

    BNB:
        820,

    SOL:
        190,

    XRP:
        3.2,

    ADA:
        0.9

};

const marketData = {

    BTC: {

        symbol:
            "BTC",

        name:
            "Bitcoin",

        price:
            0,

        change24h:
            0,

        high24h:
            0,

        low24h:
            0

    },

    ETH: {

        symbol:
            "ETH",

        name:
            "Ethereum",

        price:
            0,

        change24h:
            0,

        high24h:
            0,

        low24h:
            0

    },

    BNB: {

        symbol:
            "BNB",

        name:
            "BNB Chain",

        price:
            0,

        change24h:
            0,

        high24h:
            0,

        low24h:
            0

    },

    SOL: {

        symbol:
            "SOL",

        name:
            "Solana",

        price:
            0,

        change24h:
            0,

        high24h:
            0,

        low24h:
            0

    },

    XRP: {

        symbol:
            "XRP",

        name:
            "Ripple",

        price:
            0,

        change24h:
            0,

        high24h:
            0,

        low24h:
            0

    },

    ADA: {

        symbol:
            "ADA",

        name:
            "Cardano",

        price:
            0,

        change24h:
            0,

        high24h:
            0,

        low24h:
            0

    }

};

// ======================================================
// MARKET CONTROL
// ======================================================

const marketControl = {

    mode:
        "REAL",

    adminPrices: {

        BTC:
            118450,

        ETH:
            4300,

        BNB:
            820,

        SOL:
            190,

        XRP:
            3.2,

        ADA:
            0.9

    },

    updatedAt:
        null

};

let marketLastUpdated =
    null;

let marketLoading =
    false;

// ======================================================
// MARKET CONTROL STORAGE
// ======================================================

function saveMarketControl() {

    try {

        fs.writeFileSync(

            marketControlFile,

            JSON.stringify(
                marketControl,
                null,
                2
            ),

            "utf8"

        );

    } catch (error) {

        console.error(
            "Save market control error:",
            error.message
        );

    }

}

function loadMarketControl() {

    try {

        if (
            !fs.existsSync(
                marketControlFile
            )
        ) {

            saveMarketControl();

            return;

        }

        const raw =
            fs.readFileSync(
                marketControlFile,
                "utf8"
            );

        if (
            !raw.trim()
        ) {

            saveMarketControl();

            return;

        }

        const saved =
            JSON.parse(
                raw
            );

        if (

            saved.mode === "REAL" ||

            saved.mode === "ADMIN"

        ) {

            marketControl.mode =
                saved.mode;

        }

        if (
            saved.adminPrices
        ) {

            for (
                const symbol of
                Object.keys(
                    marketControl.adminPrices
                )
            ) {

                const price =
                    Number(
                        saved.adminPrices[
                            symbol
                        ]
                    );

                if (

                    Number.isFinite(
                        price
                    ) &&

                    price > 0

                ) {

                    marketControl.adminPrices[
                        symbol
                    ] =
                        roundMoney(
                            price
                        );

                }

            }

        }

        if (
            saved.updatedAt
        ) {

            marketControl.updatedAt =
                saved.updatedAt;

        }

    } catch (error) {

        console.error(
            "Load market control error:",
            error.message
        );

    }

}

// ======================================================
// EFFECTIVE MARKET PRICE
// ======================================================

function getEffectivePrice(
    symbol
) {

    const cleanSymbol =
        String(
            symbol || ""
        ).trim().toUpperCase();

    if (
        !marketData[
            cleanSymbol
        ]
    ) {

        return 0;

    }

    if (
        marketControl.mode ===
        "ADMIN"
    ) {

        const adminPrice =
            Number(

                marketControl.adminPrices[
                    cleanSymbol
                ]

            );

        if (

            Number.isFinite(
                adminPrice
            ) &&

            adminPrice > 0

        ) {

            return adminPrice;

        }

    }

    return Number(

        marketData[
            cleanSymbol
        ].price || 0

    );

}

// ======================================================
// PUBLIC MARKET
// ======================================================

function getPublicMarket() {

    const output = {};

    for (
        const symbol of
        Object.keys(
            marketData
        )
    ) {

        const coin =
            marketData[
                symbol
            ];

        output[
            symbol
        ] = {

            symbol:
                coin.symbol,

            name:
                coin.name,

            price:
                getEffectivePrice(
                    symbol
                ),

            realPrice:
                Number(
                    coin.price || 0
                ),

            change24h:
                Number(
                    coin.change24h || 0
                ),

            high24h:
                Number(
                    coin.high24h || 0
                ),

            low24h:
                Number(
                    coin.low24h || 0
                ),

            source:
                marketControl.mode

        };

    }

    return output;

}

// ======================================================
// REAL MARKET DATA
// ======================================================

async function updateRealMarketData() {

    if (
        marketLoading
    ) {

        return;

    }

    marketLoading =
        true;

    try {

        const ids =
            Object.values(
                COINS
            ).join(",");

        const url =

            "https://api.coingecko.com/api/v3/coins/markets" +

            "?vs_currency=usd" +

            "&ids=" +

            encodeURIComponent(
                ids
            ) +

            "&price_change_percentage=24h";


        const response =
            await fetch(

                url,

                {

                    headers: {

                        Accept:
                            "application/json",

                        "User-Agent":
                            "KrakenCoin/1.0"

                    }

                }

            );


        if (
            !response.ok
        ) {

            throw new Error(
                `CoinGecko HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        if (

            !Array.isArray(
                data
            ) ||

            data.length === 0

        ) {

            throw new Error(
                "Invalid market response."
            );

        }


        for (
            const coin of data
        ) {

            const symbol =
                Object.keys(
                    COINS
                ).find(

                    key =>
                        COINS[
                            key
                        ] ===
                        coin.id

                );


            if (!symbol) {
                continue;
            }


            marketData[
                symbol
            ].price =
                Number(
                    coin.current_price || 0
                );


            marketData[
                symbol
            ].change24h =
                Number(
                    coin.price_change_percentage_24h || 0
                );


            marketData[
                symbol
            ].high24h =
                Number(
                    coin.high_24h || 0
                );


            marketData[
                symbol
            ].low24h =
                Number(
                    coin.low_24h || 0
                );

        }


        marketLastUpdated =
            nowIso();


        console.log(
            "Real market updated:",
            new Date().toLocaleTimeString()
        );


        console.log(
            `BTC REAL: $${marketData.BTC.price}`
        );


        console.log(
            `MARKET MODE: ${marketControl.mode}`
        );


    } catch (error) {

        console.error(
            "Market API error:",
            error.message
        );


        useFallbackPrices();

    } finally {

        marketLoading =
            false;

    }

}

function useFallbackPrices() {

    for (
        const symbol of
        Object.keys(
            fallbackPrices
        )
    ) {

        if (

            !marketData[
                symbol
            ].price ||

            marketData[
                symbol
            ].price <= 0

        ) {

            marketData[
                symbol
            ].price =
                fallbackPrices[
                    symbol
                ];


            marketData[
                symbol
            ].high24h =
                fallbackPrices[
                    symbol
                ];


            marketData[
                symbol
            ].low24h =
                fallbackPrices[
                    symbol
                ];


            marketData[
                symbol
            ].change24h =
                0;

        }

    }


    marketLastUpdated =
        nowIso();

}

// ======================================================
// JWT
// ======================================================

function createToken(
    user
) {

    return jwt.sign(

        {

            userId:
                user.id,

            email:
                user.email

        },

        JWT_SECRET,

        {
            expiresIn:
                "7d"
        }

    );

}

// ======================================================
// AUTH
// ======================================================

function authenticateToken(
    req,
    res,
    next
) {

    const authHeader =
        req.headers.authorization;


    if (

        !authHeader ||

        !authHeader.startsWith(
            "Bearer "
        )

    ) {

        return res.status(
            401
        ).json({

            success:
                false,

            message:
                "Authentication required."

        });

    }


    const token =
        authHeader.substring(
            7
        );


    try {

        req.auth =
            jwt.verify(
                token,
                JWT_SECRET
            );


        next();

    } catch (error) {

        return res.status(
            401
        ).json({

            success:
                false,

            message:
                "Invalid or expired token."

        });

    }

}

function authenticateAdmin(
    req,
    res,
    next
) {

    const secret =
        req.headers[
            "x-admin-secret"
        ];


    if (

        !secret ||

        secret !==
            ADMIN_SECRET

    ) {

        return res.status(
            403
        ).json({

            success:
                false,

            message:
                "Admin authorization required."

        });

    }


    next();

}

// ======================================================
// HOME
// ======================================================

app.get(
    "/",
    (req, res) => {

        res.json({

            success:
                true,

            message:
                "KrakenCoin Backend is running",

            marketConnected:

                Object.values(
                    marketData
                ).some(

                    coin =>
                        coin.price > 0

                ),

            marketMode:
                marketControl.mode,

            marketUpdatedAt:
                marketLastUpdated,

            frontend:
                `http://localhost:${PORT}/login.html`

        });

    }
);

// ======================================================
// FRONTEND ROUTES
// ======================================================

function sendFrontendFile(
    fileName,
    res
) {

    const filePath =
        path.join(
            FRONTEND_FOLDER,
            fileName
        );


    if (
        !fs.existsSync(
            filePath
        )
    ) {

        return res.status(
            404
        ).send(
            `${fileName} not found in frontend folder.`
        );

    }


    return res.sendFile(
        filePath
    );

}

app.get(
    "/dashboard",
    (req, res) => {

        sendFrontendFile(
            "dashboard.html",
            res
        );

    }
);

app.get(
    "/admin",
    (req, res) => {

        sendFrontendFile(
            "admin.html",
            res
        );

    }
);

app.get(
    "/login",
    (req, res) => {

        sendFrontendFile(
            "login.html",
            res
        );

    }
);

// ======================================================
// MARKET API
// ======================================================

app.get(
    "/market",
    (req, res) => {

        res.json({

            success:
                true,

            mode:
                marketControl.mode,

            data:
                getPublicMarket(),

            updatedAt:
                marketLastUpdated,

            adminUpdatedAt:
                marketControl.updatedAt

        });

    }
);

app.get(
    "/api/market",
    (req, res) => {

        res.json({

            success:
                true,

            mode:
                marketControl.mode,

            data:
                getPublicMarket(),

            updatedAt:
                marketLastUpdated,

            adminUpdatedAt:
                marketControl.updatedAt

        });

    }
);

// ======================================================
// PUBLIC PAYMENT SETTINGS
// ======================================================

app.get(
    "/payment-settings",
    (req, res) => {

        const settings =
            getPaymentSettings();


        res.json({

            success:
                true,

            settings: {

                enabled:
                    Boolean(
                        settings.enabled
                    ),

                method:
                    settings.method,

                accountTitle:
                    settings.accountTitle,

                accountNumber:
                    settings.accountNumber,

                walletAddress:
                    settings.walletAddress,

                network:
                    settings.network,

                instructions:
                    settings.instructions,

                minDeposit:
                    Number(
                        settings.minDeposit || 0
                    ),

                maxDeposit:
                    Number(
                        settings.maxDeposit || 0
                    )

            }

        });

    }
);

// ======================================================
// SIGNUP
// ======================================================

app.post(
    "/signup",
    async (req, res) => {

        try {

            const {
                name,
                email,
                phone,
                password
            } =
                req.body;


            if (
                !name ||
                !email ||
                !password
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Name, email and password are required."

                });

            }


            const users =
                getUsers();


            const cleanEmail =
                String(
                    email
                )
                    .trim()
                    .toLowerCase();


            const exists =
                users.find(

                    user =>

                        String(
                            user.email || ""
                        ).toLowerCase() ===
                        cleanEmail

                );


            if (exists) {

                return res.status(
                    409
                ).json({

                    success:
                        false,

                    message:
                        "Email already exists."

                });

            }


            const hashedPassword =
                await bcrypt.hash(
                    password,
                    12
                );


            const user = {

                id:
                    Date.now(),

                name:
                    String(
                        name
                    ).trim(),

                email:
                    cleanEmail,

                phone:
                    phone
                        ? String(
                            phone
                        ).trim()
                        : "",

                password:
                    hashedPassword,

                balance:
                    0,

                trades:
                    [],

                deposits:
                    [],

                withdrawals:
                    [],

                transactions:
                    [],

                createdAt:
                    nowIso()

            };


            users.push(
                user
            );


            saveUsers(
                users
            );


            const token =
                createToken(
                    user
                );


            res.status(
                201
            ).json({

                success:
                    true,

                message:
                    "User created successfully.",

                token,

                user:
                    publicUser(
                        user
                    )

            });


        } catch (error) {

            console.error(
                "Signup error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Server error."

            });

        }

    }
);

// ======================================================
// LOGIN
// ======================================================

app.post(
    "/login",
    async (req, res) => {

        try {

            const {
                email,
                password
            } =
                req.body;


            if (
                !email ||
                !password
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Email and password are required."

                });

            }


            const users =
                getUsers();


            const cleanEmail =
                String(
                    email
                )
                    .trim()
                    .toLowerCase();


            const user =
                users.find(

                    item =>

                        String(
                            item.email || ""
                        ).toLowerCase() ===
                        cleanEmail

                );


            if (!user) {

                return res.status(
                    401
                ).json({

                    success:
                        false,

                    message:
                        "Invalid email or password."

                });

            }


            const passwordMatch =
                await bcrypt.compare(

                    password,

                    user.password

                );


            if (!passwordMatch) {

                return res.status(
                    401
                ).json({

                    success:
                        false,

                    message:
                        "Invalid email or password."

                });

            }


            normalizeUser(
                user
            );


            saveUsers(
                users
            );


            const token =
                createToken(
                    user
                );


            res.json({

                success:
                    true,

                message:
                    "Login successful.",

                token,

                user:
                    publicUser(
                        user
                    )

            });


        } catch (error) {

            console.error(
                "Login error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Server error."

            });

        }

    }
);

// ======================================================
// ME
// ======================================================

app.get(
    "/me",
    authenticateToken,
    (req, res) => {

        const users =
            getUsers();


        const user =
            findUser(
                users,
                req.auth.userId
            );


        if (!user) {

            return res.status(
                404
            ).json({

                success:
                    false,

                message:
                    "User not found."

            });

        }


        normalizeUser(
            user
        );


        saveUsers(
            users
        );


        res.json({

            success:
                true,

            user:
                publicUser(
                    user
                )

        });

    }
);

// ======================================================
// USER
// ======================================================

app.get(
    "/user/:id",
    authenticateToken,
    (req, res) => {

        if (

            String(
                req.auth.userId
            ) !==

            String(
                req.params.id
            )

        ) {

            return res.status(
                403
            ).json({

                success:
                    false,

                message:
                    "Access denied."

            });

        }


        const users =
            getUsers();


        const user =
            findUser(
                users,
                req.params.id
            );


        if (!user) {

            return res.status(
                404
            ).json({

                success:
                    false,

                message:
                    "User not found."

            });

        }


        normalizeUser(
            user
        );


        saveUsers(
            users
        );


        res.json({

            success:
                true,

            user:
                publicUser(
                    user
                )

        });

    }
);

// ======================================================
// TRADES
// ======================================================

app.get(
    "/trades",
    authenticateToken,
    (req, res) => {

        const users =
            getUsers();


        const user =
            findUser(
                users,
                req.auth.userId
            );


        if (!user) {

            return res.status(
                404
            ).json({

                success:
                    false,

                message:
                    "User not found."

            });

        }


        normalizeUser(
            user
        );


        res.json({

            success:
                true,

            balance:
                roundMoney(
                    user.balance
                ),

            trades:
                user.trades

        });

    }
);

// ======================================================
// CREATE TRADE
// ======================================================

app.post(
    "/trade",
    authenticateToken,
    (req, res) => {

        try {

            const users =
                getUsers();


            const user =
                findUser(
                    users,
                    req.auth.userId
                );


            if (!user) {

                return res.status(
                    404
                ).json({

                    success:
                        false,

                    message:
                        "User not found."

                });

            }


            normalizeUser(
                user
            );


            const symbol =
                String(
                    req.body.symbol ||
                    "BTC"
                )
                    .trim()
                    .toUpperCase();


            const type =
                String(
                    req.body.type ||
                    ""
                )
                    .trim()
                    .toUpperCase();


            const amount =
                Number(
                    req.body.amount
                );


            const requestedDuration =
                Number(
                    req.body.duration
                );


            const allowedDurations = [

                30,
                60,
                300,
                1800

            ];


            const duration =
                allowedDurations.includes(
                    requestedDuration
                )
                    ? requestedDuration
                    : DEFAULT_TRADE_DURATION;


            if (
                !marketData[
                    symbol
                ]
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Invalid market."

                });

            }


            if (
                type !== "BUY" &&
                type !== "SELL"
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Trade type must be BUY or SELL."

                });

            }


            if (
                !Number.isFinite(
                    amount
                ) ||
                amount <= 0
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Invalid trade amount."

                });

            }


            const cleanAmount =
                roundMoney(
                    amount
                );


            const price =
                Number(
                    getEffectivePrice(
                        symbol
                    )
                );


            if (
                !Number.isFinite(
                    price
                ) ||
                price <= 0
            ) {

                return res.status(
                    503
                ).json({

                    success:
                        false,

                    message:
                        "Market price is not available."

                });

            }


            const openTrade =
                user.trades.find(

                    trade =>
                        trade.status ===
                        "OPEN"

                );


            if (openTrade) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "You already have an open trade."

                });

            }


            if (
                cleanAmount >
                user.balance
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Insufficient balance."

                });

            }


            user.balance =
                roundMoney(

                    user.balance -
                    cleanAmount

                );


            const tradeId =
                Date.now();


            const trade = {

                id:
                    tradeId,

                userId:
                    user.id,

                symbol:
                    symbol,

                name:
                    marketData[
                        symbol
                    ].name,

                type:
                    type,

                amount:
                    cleanAmount,

                entryPrice:
                    price,

                entryMode:
                    marketControl.mode,

                duration:
                    duration,

                closePrice:
                    null,

                closeMode:
                    null,

                status:
                    "OPEN",

                result:
                    "OPEN",

                profit:
                    0,

                createdAt:
                    nowIso(),

                expiresAt:
                    new Date(
                        Date.now() +
                        duration * 1000
                    ).toISOString(),

                closedAt:
                    null

            };


            user.trades.unshift(
                trade
            );


            user.transactions.unshift({

                id:
                    Date.now() +
                    Math.random(),

                type:
                    "TRADE",

                amount:
                    cleanAmount,

                direction:
                    "DEBIT",

                description:
                    `${symbol} ${type} trade`,

                status:
                    "COMPLETED",

                createdAt:
                    nowIso()

            });


            saveUsers(
                users
            );


            res.status(
                201
            ).json({

                success:
                    true,

                message:
                    `${symbol} ${type} trade created successfully.`,

                trade:
                    trade,

                balance:
                    roundMoney(
                        user.balance
                    ),

                duration:
                    duration,

                marketMode:
                    marketControl.mode

            });


            scheduleTradeSettlement(

                trade.id,

                duration * 1000

            );


        } catch (error) {

            console.error(
                "Trade error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Trade server error."

            });

        }

    }
);

// ======================================================
// SETTLE TRADE
// ======================================================

function settleTrade(
    tradeId
) {

    try {

        const users =
            getUsers();


        for (
            const user of
            users
        ) {

            normalizeUser(
                user
            );


            const trade =
                user.trades.find(

                    item =>

                        String(
                            item.id
                        ) ===

                        String(
                            tradeId
                        )

                );


            if (!trade) {
                continue;
            }


            if (
                trade.status !==
                "OPEN"
            ) {

                return;

            }


            const symbol =
                String(
                    trade.symbol ||
                    "BTC"
                )
                    .trim()
                    .toUpperCase();


            const closePrice =
                Number(
                    getEffectivePrice(
                        symbol
                    )
                );


            const entryPrice =
                Number(
                    trade.entryPrice
                );


            const amount =
                Number(
                    trade.amount
                );


            if (
                !Number.isFinite(
                    closePrice
                ) ||
                closePrice <= 0
            ) {

                scheduleTradeSettlement(
                    trade.id,
                    5000
                );

                return;

            }


            let isWin =
                false;


            if (
                trade.type ===
                "BUY"
            ) {

                isWin =
                    closePrice >
                    entryPrice;

            }


            if (
                trade.type ===
                "SELL"
            ) {

                isWin =
                    closePrice <
                    entryPrice;

            }


            trade.closePrice =
                closePrice;


            trade.closeMode =
                marketControl.mode;


            trade.closedAt =
                nowIso();


            if (isWin) {

                const profit =
                    roundMoney(

                        amount *
                        WIN_PAYOUT

                    );


                const returnedAmount =
                    roundMoney(

                        amount +
                        profit

                    );


                user.balance =
                    roundMoney(

                        user.balance +
                        returnedAmount

                    );


                trade.status =
                    "WIN";


                trade.result =
                    "WIN";


                trade.profit =
                    profit;


                user.transactions.unshift({

                    id:
                        Date.now() +
                        Math.random(),

                    type:
                        "TRADE_RESULT",

                    amount:
                        returnedAmount,

                    direction:
                        "CREDIT",

                    description:
                        `${symbol} ${trade.type} trade won`,

                    status:
                        "COMPLETED",

                    createdAt:
                        nowIso()

                });

            } else {

                trade.status =
                    "LOSE";


                trade.result =
                    "LOSE";


                trade.profit =
                    roundMoney(
                        -amount
                    );


                user.transactions.unshift({

                    id:
                        Date.now() +
                        Math.random(),

                    type:
                        "TRADE_RESULT",

                    amount:
                        amount,

                    direction:
                        "DEBIT",

                    description:
                        `${symbol} ${trade.type} trade lost`,

                    status:
                        "COMPLETED",

                    createdAt:
                        nowIso()

                });

            }


            saveUsers(
                users
            );


            console.log(

                `Trade ${trade.id} | ${symbol} | ${trade.type} | ${trade.status} | Entry: ${entryPrice} | Close: ${closePrice} | Mode: ${marketControl.mode}`

            );


            return;

        }

    } catch (error) {

        console.error(
            "Settlement error:",
            error
        );

    }

}

function scheduleTradeSettlement(
    tradeId,
    delay
) {

    setTimeout(

        () => {

            settleTrade(
                tradeId
            );

        },

        Math.max(
            0,
            delay
        )

    );

}

function restoreOpenTrades() {

    try {

        const users =
            getUsers();


        const now =
            Date.now();


        for (
            const user of
            users
        ) {

            normalizeUser(
                user
            );


            for (
                const trade of
                user.trades
            ) {

                if (

                    trade.status !==
                        "OPEN" ||

                    !trade.expiresAt

                ) {

                    continue;

                }


                const expiresAt =
                    new Date(
                        trade.expiresAt
                    ).getTime();


                if (
                    !Number.isFinite(
                        expiresAt
                    )
                ) {

                    continue;

                }


                const remaining =
                    expiresAt -
                    now;


                if (
                    remaining <= 0
                ) {

                    settleTrade(
                        trade.id
                    );

                } else {

                    scheduleTradeSettlement(

                        trade.id,

                        remaining

                    );

                }

            }

        }


        console.log(
            "Open trades restored."
        );

    } catch (error) {

        console.error(
            "Restore trades error:",
            error
        );

    }

}

// ======================================================
// WALLET
// ======================================================

app.get(
    "/wallet",
    authenticateToken,
    (req, res) => {

        const users =
            getUsers();


        const user =
            findUser(
                users,
                req.auth.userId
            );


        if (!user) {

            return res.status(
                404
            ).json({

                success:
                    false,

                message:
                    "User not found."

            });

        }


        normalizeUser(
            user
        );


        res.json({

            success:
                true,

            balance:
                roundMoney(
                    user.balance
                ),

            deposits:
                user.deposits,

            withdrawals:
                user.withdrawals,

            transactions:
                user.transactions

        });

    }
);

// ======================================================
// DEPOSIT REQUEST
// ======================================================
//
// NO ADMIN APPROVAL HERE.
//
// The request is recorded for reference/history.
// User balance is NOT automatically credited.
// Admin can manually credit balance from Admin Panel.
//

app.post(
    "/wallet/deposit",
    authenticateToken,
    (req, res) => {

        try {

            const amount =
                Number(
                    req.body.amount
                );


            const method =
                String(
                    req.body.method ||
                    ""
                ).trim();


            const reference =
                String(
                    req.body.reference ||
                    ""
                ).trim();


            const settings =
                getPaymentSettings();


            if (
                !settings.enabled
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Deposits are currently disabled."

                });

            }


            if (
                !Number.isFinite(
                    amount
                ) ||
                amount <= 0
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Enter a valid amount."

                });

            }


            if (
                amount <
                Number(
                    settings.minDeposit || 0
                )
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        `Minimum deposit is $${settings.minDeposit}.`

                });

            }


            if (
                amount >
                Number(
                    settings.maxDeposit || 0
                )
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        `Maximum deposit is $${settings.maxDeposit}.`

                });

            }


            if (!method) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Deposit method is required."

                });

            }


            if (!reference) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Payment reference is required."

                });

            }


            const users =
                getUsers();


            const user =
                findUser(
                    users,
                    req.auth.userId
                );


            if (!user) {

                return res.status(
                    404
                ).json({

                    success:
                        false,

                    message:
                        "User not found."

                });

            }


            normalizeUser(
                user
            );


            const depositId =
                Date.now() +
                Math.floor(
                    Math.random() * 10000
                );


            const deposit = {

                id:
                    depositId,

                userId:
                    user.id,

                userName:
                    user.name,

                userEmail:
                    user.email,

                amount:
                    roundMoney(
                        amount
                    ),

                type:
                    "DEPOSIT",

                status:
                    "SUBMITTED",

                method:
                    method,

                reference:
                    reference,

                createdAt:
                    nowIso(),

                processedAt:
                    null,

                adminNote:
                    ""

            };


            user.deposits.unshift(
                deposit
            );


            user.transactions.unshift({

                id:
                    deposit.id,

                type:
                    "DEPOSIT",

                amount:
                    deposit.amount,

                direction:
                    "PENDING",

                description:
                    "Deposit submitted for manual balance credit",

                status:
                    "PENDING",

                createdAt:
                    deposit.createdAt

            });


            saveUsers(
                users
            );


            res.status(
                201
            ).json({

                success:
                    true,

                message:
                    "Deposit recorded. Admin can manually credit the received amount from the Admin Panel.",

                deposit:
                    deposit,

                balance:
                    roundMoney(
                        user.balance
                    )

            });

        } catch (error) {

            console.error(
                "Deposit error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to submit deposit."

            });

        }

    }
);

// ======================================================
// DEPOSIT HISTORY
// ======================================================

app.get(
    "/wallet/deposits",
    authenticateToken,
    (req, res) => {

        const users =
            getUsers();


        const user =
            findUser(
                users,
                req.auth.userId
            );


        if (!user) {

            return res.status(
                404
            ).json({

                success:
                    false,

                message:
                    "User not found."

            });

        }


        normalizeUser(
            user
        );


        res.json({

            success:
                true,

            balance:
                roundMoney(
                    user.balance
                ),

            deposits:
                user.deposits

        });

    }
);

// ======================================================
// WITHDRAW
// ======================================================

app.post(
    "/wallet/withdraw",
    authenticateToken,
    (req, res) => {

        try {

            const amount =
                Number(
                    req.body.amount
                );


            const method =
                String(
                    req.body.method ||
                    ""
                ).trim();


            const account =
                String(

                    req.body.account ||

                    req.body.address ||

                    ""

                ).trim();


            if (
                !Number.isFinite(
                    amount
                ) ||
                amount <= 0
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Enter a valid withdrawal amount."

                });

            }


            if (
                !method
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Withdrawal method is required."

                });

            }


            if (
                !account
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Withdrawal account is required."

                });

            }


            const cleanAmount =
                roundMoney(
                    amount
                );


            const users =
                getUsers();


            const user =
                findUser(
                    users,
                    req.auth.userId
                );


            if (!user) {

                return res.status(
                    404
                ).json({

                    success:
                        false,

                    message:
                        "User not found."

                });

            }


            normalizeUser(
                user
            );


            if (
                cleanAmount >
                user.balance
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Insufficient available balance."

                });

            }


            /*
             * Hold the amount immediately.
             */

            user.balance =
                roundMoney(

                    user.balance -
                    cleanAmount

                );


            const withdrawalId =
                Date.now() +
                Math.floor(
                    Math.random() * 10000
                );


            const withdrawal = {

                id:
                    withdrawalId,

                userId:
                    user.id,

                userName:
                    user.name,

                userEmail:
                    user.email,

                amount:
                    cleanAmount,

                method:
                    method,

                account:
                    account,

                status:
                    "PENDING",

                createdAt:
                    nowIso(),

                processedAt:
                    null,

                adminNote:
                    ""

            };


            user.withdrawals.unshift(
                withdrawal
            );


            user.transactions.unshift({

                id:
                    withdrawal.id,

                type:
                    "WITHDRAW",

                amount:
                    cleanAmount,

                direction:
                    "DEBIT",

                description:
                    "Withdrawal request",

                status:
                    "PENDING",

                createdAt:
                    withdrawal.createdAt

            });


            saveUsers(
                users
            );


            res.status(
                201
            ).json({

                success:
                    true,

                message:
                    "Withdrawal request submitted.",

                withdrawal:
                    withdrawal,

                balance:
                    roundMoney(
                        user.balance
                    )

            });

        } catch (error) {

            console.error(
                "Withdrawal error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to submit withdrawal."

            });

        }

    }
);

// ======================================================
// WITHDRAWAL HISTORY
// ======================================================

app.get(
    "/wallet/withdrawals",
    authenticateToken,
    (req, res) => {

        const users =
            getUsers();


        const user =
            findUser(
                users,
                req.auth.userId
            );


        if (!user) {

            return res.status(
                404
            ).json({

                success:
                    false,

                message:
                    "User not found."

            });

        }


        normalizeUser(
            user
        );


        res.json({

            success:
                true,

            balance:
                roundMoney(
                    user.balance
                ),

            withdrawals:
                user.withdrawals

        });

    }
);

// ======================================================
// TRANSACTIONS
// ======================================================

app.get(
    "/wallet/transactions",
    authenticateToken,
    (req, res) => {

        const users =
            getUsers();


        const user =
            findUser(
                users,
                req.auth.userId
            );


        if (!user) {

            return res.status(
                404
            ).json({

                success:
                    false,

                message:
                    "User not found."

            });

        }


        normalizeUser(
            user
        );


        res.json({

            success:
                true,

            balance:
                roundMoney(
                    user.balance
                ),

            transactions:
                user.transactions

        });

    }
);

// ======================================================
// ADMIN USERS
// ======================================================

app.get(
    "/users",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        try {

            const users =
                getUsers();


            users.forEach(
                normalizeUser
            );


            saveUsers(
                users
            );


            res.json({

                success:
                    true,

                users:
                    users.map(
                        publicUser
                    )

            });

        } catch (error) {

            console.error(
                "Get users error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Server error."

            });

        }

    }
);

// ======================================================
// ADMIN SINGLE USER
// ======================================================

app.get(
    "/admin/user/:id",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        const users =
            getUsers();


        const user =
            findUser(
                users,
                req.params.id
            );


        if (!user) {

            return res.status(
                404
            ).json({

                success:
                    false,

                message:
                    "User not found."

            });

        }


        normalizeUser(
            user
        );


        res.json({

            success:
                true,

            user:
                publicUser(
                    user
                )

        });

    }
);

// ======================================================
// ADMIN ADD BALANCE
// ======================================================

app.post(
    "/admin/add-balance",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        try {

            const userId =
                req.body.userId;


            const amount =
                Number(
                    req.body.amount
                );


            if (
                !userId ||
                !Number.isFinite(
                    amount
                ) ||
                amount <= 0
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Invalid user or amount."

                });

            }


            const users =
                getUsers();


            const user =
                findUser(
                    users,
                    userId
                );


            if (!user) {

                return res.status(
                    404
                ).json({

                    success:
                        false,

                    message:
                        "User not found."

                });

            }


            normalizeUser(
                user
            );


            const cleanAmount =
                roundMoney(
                    amount
                );


            user.balance =
                roundMoney(

                    user.balance +
                    cleanAmount

                );


            user.transactions.unshift({

                id:
                    Date.now() +
                    Math.random(),

                type:
                    "ADMIN_CREDIT",

                amount:
                    cleanAmount,

                direction:
                    "CREDIT",

                description:
                    "Admin manually added balance",

                status:
                    "COMPLETED",

                createdAt:
                    nowIso()

            });


            saveUsers(
                users
            );


            res.json({

                success:
                    true,

                message:
                    "Balance added successfully.",

                balance:
                    user.balance,

                user:
                    publicUser(
                        user
                    )

            });

        } catch (error) {

            console.error(
                "Add balance error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Server error."

            });

        }

    }
);

// ======================================================
// ADMIN REMOVE BALANCE
// ======================================================

app.post(
    "/admin/remove-balance",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        try {

            const userId =
                req.body.userId;


            const amount =
                Number(
                    req.body.amount
                );


            if (
                !userId ||
                !Number.isFinite(
                    amount
                ) ||
                amount <= 0
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Invalid user or amount."

                });

            }


            const users =
                getUsers();


            const user =
                findUser(
                    users,
                    userId
                );


            if (!user) {

                return res.status(
                    404
                ).json({

                    success:
                        false,

                    message:
                        "User not found."

                });

            }


            normalizeUser(
                user
            );


            const cleanAmount =
                roundMoney(
                    amount
                );


            if (
                cleanAmount >
                user.balance
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Cannot remove more than current balance."

                });

            }


            user.balance =
                roundMoney(

                    user.balance -
                    cleanAmount

                );


            user.transactions.unshift({

                id:
                    Date.now() +
                    Math.random(),

                type:
                    "ADMIN_DEBIT",

                amount:
                    cleanAmount,

                direction:
                    "DEBIT",

                description:
                    "Admin manually removed balance",

                status:
                    "COMPLETED",

                createdAt:
                    nowIso()

            });


            saveUsers(
                users
            );


            res.json({

                success:
                    true,

                message:
                    "Balance removed successfully.",

                balance:
                    user.balance,

                user:
                    publicUser(
                        user
                    )

            });

        } catch (error) {

            console.error(
                "Remove balance error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Server error."

            });

        }

    }
);

// ======================================================
// ADMIN PAYMENT SETTINGS GET
// ======================================================

app.get(
    "/admin/payment-settings",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        res.json({

            success:
                true,

            settings:
                getPaymentSettings()

        });

    }
);

// ======================================================
// ADMIN PAYMENT SETTINGS SAVE
// ======================================================

app.post(
    "/admin/payment-settings",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        try {

            const current =
                getPaymentSettings();


            const settings = {

                enabled:
                    req.body.enabled === undefined
                        ? current.enabled
                        : Boolean(
                            req.body.enabled
                        ),

                method:
                    req.body.method !== undefined
                        ? String(
                            req.body.method
                        ).trim()
                        : current.method,

                accountTitle:
                    req.body.accountTitle !== undefined
                        ? String(
                            req.body.accountTitle
                        ).trim()
                        : current.accountTitle,

                accountNumber:
                    req.body.accountNumber !== undefined
                        ? String(
                            req.body.accountNumber
                        ).trim()
                        : current.accountNumber,

                walletAddress:
                    req.body.walletAddress !== undefined
                        ? String(
                            req.body.walletAddress
                        ).trim()
                        : current.walletAddress,

                network:
                    req.body.network !== undefined
                        ? String(
                            req.body.network
                        ).trim()
                        : current.network,

                instructions:
                    req.body.instructions !== undefined
                        ? String(
                            req.body.instructions
                        ).trim()
                        : current.instructions,

                minDeposit:
                    req.body.minDeposit !== undefined
                        ? roundMoney(
                            Number(
                                req.body.minDeposit
                            )
                        )
                        : current.minDeposit,

                maxDeposit:
                    req.body.maxDeposit !== undefined
                        ? roundMoney(
                            Number(
                                req.body.maxDeposit
                            )
                        )
                        : current.maxDeposit,

                updatedAt:
                    nowIso()

            };


            if (
                settings.minDeposit < 0
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Minimum deposit cannot be negative."

                });

            }


            if (
                settings.maxDeposit <= 0
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Maximum deposit must be greater than 0."

                });

            }


            if (
                settings.minDeposit >
                settings.maxDeposit
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "Minimum deposit cannot exceed maximum deposit."

                });

            }


            savePaymentSettings(
                settings
            );


            res.json({

                success:
                    true,

                message:
                    "Payment settings updated successfully.",

                settings:
                    settings

            });

        } catch (error) {

            console.error(
                "Payment settings error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to save payment settings."

            });

        }

    }
);

// ======================================================
// ADMIN GET DEPOSITS
// ======================================================

app.get(
    "/admin/deposits",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        try {

            const users =
                getUsers();


            const deposits = [];


            for (
                const user of
                users
            ) {

                normalizeUser(
                    user
                );


                for (
                    const deposit of
                    user.deposits
                ) {

                    deposits.push({

                        ...deposit,

                        userId:
                            user.id,

                        userName:
                            user.name,

                        userEmail:
                            user.email

                    });

                }

            }


            deposits.sort(

                (a, b) =>

                    new Date(
                        b.createdAt
                    ) -

                    new Date(
                        a.createdAt
                    )

            );


            res.json({

                success:
                    true,

                deposits:
                    deposits

            });

        } catch (error) {

            console.error(
                "Admin deposits error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to load deposits."

            });

        }

    }
);

// ======================================================
// ADMIN GET WITHDRAWALS
// ======================================================

app.get(
    "/admin/withdrawals",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        try {

            const users =
                getUsers();


            const withdrawals = [];


            for (
                const user of
                users
            ) {

                normalizeUser(
                    user
                );


                for (
                    const withdrawal of
                    user.withdrawals
                ) {

                    withdrawals.push({

                        ...withdrawal,

                        userId:
                            user.id,

                        userName:
                            user.name,

                        userEmail:
                            user.email

                    });

                }

            }


            withdrawals.sort(

                (a, b) =>

                    new Date(
                        b.createdAt
                    ) -

                    new Date(
                        a.createdAt
                    )

            );


            res.json({

                success:
                    true,

                withdrawals:
                    withdrawals

            });

        } catch (error) {

            console.error(
                "Admin withdrawals error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to load withdrawals."

            });

        }

    }
);

// ======================================================
// ADMIN APPROVE WITHDRAWAL
// ======================================================

app.post(
    "/admin/withdrawal/:withdrawalId/approve",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        try {

            const withdrawalId =
                req.params.withdrawalId;


            const users =
                getUsers();


            let foundUser =
                null;

            let withdrawal =
                null;


            for (
                const user of
                users
            ) {

                normalizeUser(
                    user
                );


                const item =
                    user.withdrawals.find(

                        entry =>

                            String(
                                entry.id
                            ) ===

                            String(
                                withdrawalId
                            )

                    );


                if (item) {

                    foundUser =
                        user;

                    withdrawal =
                        item;

                    break;

                }

            }


            if (
                !foundUser ||
                !withdrawal
            ) {

                return res.status(
                    404
                ).json({

                    success:
                        false,

                    message:
                        "Withdrawal request not found."

                });

            }


            if (
                withdrawal.status !==
                "PENDING"
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        `Withdrawal is already ${withdrawal.status}.`

                });

            }


            /*
             * Balance was already held when request was created.
             * Do not deduct again.
             */

            withdrawal.status =
                "APPROVED";


            withdrawal.processedAt =
                nowIso();


            withdrawal.adminNote =
                String(

                    req.body.note ||

                    "Withdrawal approved by admin."

                );


            const transaction =
                foundUser.transactions.find(

                    item =>

                        String(
                            item.id
                        ) ===

                        String(
                            withdrawal.id
                        )

                );


            if (transaction) {

                transaction.status =
                    "COMPLETED";

                transaction.description =
                    "Withdrawal approved";

            }


            saveUsers(
                users
            );


            res.json({

                success:
                    true,

                message:
                    "Withdrawal approved successfully.",

                withdrawal:
                    withdrawal,

                balance:
                    roundMoney(
                        foundUser.balance
                    )

            });

        } catch (error) {

            console.error(
                "Approve withdrawal error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to approve withdrawal."

            });

        }

    }
);

// ======================================================
// ADMIN REJECT WITHDRAWAL / REFUND
// ======================================================

app.post(
    "/admin/withdrawal/:withdrawalId/reject",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        try {

            const withdrawalId =
                req.params.withdrawalId;


            const users =
                getUsers();


            let foundUser =
                null;

            let withdrawal =
                null;


            for (
                const user of
                users
            ) {

                normalizeUser(
                    user
                );


                const item =
                    user.withdrawals.find(

                        entry =>

                            String(
                                entry.id
                            ) ===

                            String(
                                withdrawalId
                            )

                    );


                if (item) {

                    foundUser =
                        user;

                    withdrawal =
                        item;

                    break;

                }

            }


            if (
                !foundUser ||
                !withdrawal
            ) {

                return res.status(
                    404
                ).json({

                    success:
                        false,

                    message:
                        "Withdrawal request not found."

                });

            }


            if (
                withdrawal.status !==
                "PENDING"
            ) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        `Withdrawal is already ${withdrawal.status}.`

                });

            }


            /*
             * Refund held money.
             */

            foundUser.balance =
                roundMoney(

                    Number(
                        foundUser.balance ||
                        0
                    ) +

                    Number(
                        withdrawal.amount ||
                        0
                    )

                );


            withdrawal.status =
                "REJECTED";


            withdrawal.processedAt =
                nowIso();


            withdrawal.adminNote =
                String(

                    req.body.note ||

                    "Withdrawal rejected by admin."

                );


            const transaction =
                foundUser.transactions.find(

                    item =>

                        String(
                            item.id
                        ) ===

                        String(
                            withdrawal.id
                        )

                );


            if (transaction) {

                transaction.status =
                    "REJECTED";

                transaction.description =
                    "Withdrawal rejected and refunded";

            }


            foundUser.transactions.unshift({

                id:
                    Date.now() +
                    Math.random(),

                type:
                    "WITHDRAW_REFUND",

                amount:
                    roundMoney(
                        withdrawal.amount
                    ),

                direction:
                    "CREDIT",

                description:
                    "Withdrawal rejected - amount refunded",

                status:
                    "COMPLETED",

                createdAt:
                    nowIso()

            });


            saveUsers(
                users
            );


            res.json({

                success:
                    true,

                message:
                    "Withdrawal rejected and amount refunded.",

                withdrawal:
                    withdrawal,

                balance:
                    roundMoney(
                        foundUser.balance
                    )

            });

        } catch (error) {

            console.error(
                "Reject withdrawal error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to reject withdrawal."

            });

        }

    }
);

// ======================================================
// ADMIN MARKET CONTROL GET
// ======================================================

app.get(
    "/admin/market-control",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        const adminPrices = {};
        const realPrices = {};
        const effectivePrices = {};


        for (
            const symbol of
            Object.keys(
                marketData
            )
        ) {

            adminPrices[
                symbol
            ] =
                Number(

                    marketControl.adminPrices[
                        symbol
                    ] || 0

                );


            realPrices[
                symbol
            ] =
                Number(

                    marketData[
                        symbol
                    ].price || 0

                );


            effectivePrices[
                symbol
            ] =
                Number(

                    getEffectivePrice(
                        symbol
                    )

                );

        }


        res.json({

            success:
                true,

            mode:
                marketControl.mode,

            adminPrices:
                adminPrices,

            realPrices:
                realPrices,

            effectivePrices:
                effectivePrices,

            updatedAt:
                marketControl.updatedAt,

            realMarketUpdatedAt:
                marketLastUpdated

        });

    }
);

// ======================================================
// ADMIN MARKET MODE
// ======================================================

app.post(
    "/admin/market-control/mode",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        const mode =
            String(
                req.body.mode ||
                ""
            )
                .trim()
                .toUpperCase();


        if (
            mode !== "REAL" &&
            mode !== "ADMIN"
        ) {

            return res.status(
                400
            ).json({

                success:
                    false,

                message:
                    "Mode must be REAL or ADMIN."

            });

        }


        marketControl.mode =
            mode;


        marketControl.updatedAt =
            nowIso();


        saveMarketControl();


        res.json({

            success:
                true,

            message:

                mode === "REAL"

                    ? "Real market mode activated."

                    : "Admin market control activated.",

            mode:
                mode,

            market:
                getPublicMarket(),

            updatedAt:
                marketControl.updatedAt

        });

    }
);

// ======================================================
// ADMIN SET COIN PRICE
// ======================================================

app.post(
    "/admin/market-control/price",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        const symbol =
            String(
                req.body.symbol ||
                ""
            )
                .trim()
                .toUpperCase();


        const price =
            Number(
                req.body.price
            );


        if (
            !marketData[
                symbol
            ]
        ) {

            return res.status(
                400
            ).json({

                success:
                    false,

                message:
                    "Invalid coin symbol."

            });

        }


        if (
            !Number.isFinite(
                price
            ) ||
            price <= 0
        ) {

            return res.status(
                400
            ).json({

                success:
                    false,

                message:
                    "Price must be greater than 0."

            });

        }


        const cleanPrice =
            roundMoney(
                price
            );


        marketControl.adminPrices[
            symbol
        ] =
            cleanPrice;


        marketControl.updatedAt =
            nowIso();


        saveMarketControl();


        res.json({

            success:
                true,

            message:
                `${symbol} admin price updated successfully.`,

            mode:
                marketControl.mode,

            symbol:
                symbol,

            adminPrice:
                cleanPrice,

            effectivePrice:
                getEffectivePrice(
                    symbol
                ),

            updatedAt:
                marketControl.updatedAt

        });

    }
);

// ======================================================
// ADMIN SET ALL COIN PRICES
// ======================================================

app.post(
    "/admin/market-control/prices",
    authenticateToken,
    authenticateAdmin,
    (req, res) => {

        try {

            const body =
                req.body || {};

            let changed =
                false;


            for (
                const symbol of
                Object.keys(
                    marketControl.adminPrices
                )
            ) {

                if (
                    body[
                        symbol
                    ] === undefined
                ) {

                    continue;

                }


                const price =
                    Number(
                        body[
                            symbol
                        ]
                    );


                if (
                    !Number.isFinite(
                        price
                    ) ||
                    price <= 0
                ) {

                    return res.status(
                        400
                    ).json({

                        success:
                            false,

                        message:
                            `Invalid price for ${symbol}.`

                    });

                }


                marketControl.adminPrices[
                    symbol
                ] =
                    roundMoney(
                        price
                    );


                changed =
                    true;

            }


            if (!changed) {

                return res.status(
                    400
                ).json({

                    success:
                        false,

                    message:
                        "No valid prices were provided."

                });

            }


            marketControl.updatedAt =
                nowIso();


            saveMarketControl();


            res.json({

                success:
                    true,

                message:
                    "Admin market prices updated.",

                mode:
                    marketControl.mode,

                adminPrices:
                    marketControl.adminPrices,

                market:
                    getPublicMarket(),

                updatedAt:
                    marketControl.updatedAt

            });

        } catch (error) {

            console.error(
                "Admin all prices error:",
                error
            );


            res.status(
                500
            ).json({

                success:
                    false,

                message:
                    "Unable to update admin prices."

            });

        }

    }
);

// ======================================================
// 404 API
// ======================================================

app.use(
    (req, res) => {

        res.status(
            404
        ).json({

            success:
                false,

            message:
                "API endpoint not found."

        });

    }
);

// ======================================================
// START SERVER
// ======================================================

app.listen(
    PORT,
    async () => {

        console.log("");
        console.log(
            "=========================================="
        );

        console.log(
            `KrakenCoin Server: http://localhost:${PORT}`
        );

        console.log(
            `Dashboard: http://localhost:${PORT}/dashboard.html`
        );

        console.log(
            `Login: http://localhost:${PORT}/login.html`
        );

        console.log(
            `Admin: http://localhost:${PORT}/admin.html`
        );

        console.log(
            "Frontend folder:",
            FRONTEND_FOLDER
        );

        console.log(
            "=========================================="
        );


        loadMarketControl();


        console.log(
            "Market Control Mode:",
            marketControl.mode
        );


        await updateRealMarketData();


        setInterval(
            updateRealMarketData,
            MARKET_UPDATE_INTERVAL
        );


        restoreOpenTrades();

    }
);