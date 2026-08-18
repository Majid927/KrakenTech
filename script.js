const API_URL = (typeof window !== "undefined" && window.location.protocol.startsWith("http"))
    ? window.location.origin
    : "http://localhost:3000";


// ======================================================
// AUTH TOKEN
// ======================================================

function getAuthToken() {

    const keys = [
        "tradeXToken",
        "token",
        "jwtToken",
        "authToken"
    ];

    for (const key of keys) {

        const value =
            localStorage.getItem(key);

        if (value) {
            return value;
        }
    }

    return "";
}


// ======================================================
// AUTH HEADERS
// ======================================================

function getAuthHeaders(
    includeAdmin = false
) {

    const token =
        getAuthToken();

    const headers = {
        "Content-Type": "application/json"
    };

    if (token) {

        headers.Authorization =
            "Bearer " + token;

    }

    if (includeAdmin) {

        headers["X-Admin-Secret"] =
            "KrakenTech-Admin-Change-This-Secret-2026";

    }

    return headers;
}


// ======================================================
// CURRENT USER
// ======================================================

function getCurrentUser() {

    const saved =
        localStorage.getItem(
            "tradeXUser"
        );

    if (!saved) {
        return null;
    }

    try {

        return JSON.parse(
            saved
        );

    } catch (error) {

        console.error(
            "User storage error:",
            error
        );

        return null;
    }
}


function saveCurrentUser(
    user
) {

    if (!user) {
        return;
    }

    localStorage.setItem(
        "tradeXUser",
        JSON.stringify(
            user
        )
    );

    if (user.id !== undefined) {

        localStorage.setItem(
            "currentUserId",
            String(
                user.id
            )
        );
    }
}


// ======================================================
// AUTH CHECK
// ======================================================

function isLoggedIn() {

    return Boolean(
        getAuthToken()
    );
}


function requireLogin() {

    if (
        !isLoggedIn()
    ) {

        window.location.href =
            "login.html";

        return false;
    }

    return true;
}


// ======================================================
// LOGOUT
// ======================================================

function logout() {

    localStorage.removeItem(
        "tradeXToken"
    );

    localStorage.removeItem(
        "token"
    );

    localStorage.removeItem(
        "jwtToken"
    );

    localStorage.removeItem(
        "authToken"
    );

    localStorage.removeItem(
        "tradeXUser"
    );

    localStorage.removeItem(
        "currentUserId"
    );

    localStorage.removeItem(
        "login"
    );

    window.location.href =
        "/login.html";
}


// ======================================================
// ESCAPE HTML
// ======================================================

function esc(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


// ======================================================
// MONEY FORMAT
// ======================================================

function money(
    value
) {

    const amount =
        Number(
            value || 0
        );

    return (
        "$" +
        amount.toLocaleString(
            "en-US",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        )
    );

}


// ======================================================
// JSON REQUEST
// ======================================================

async function apiRequest(
    url,
    method = "GET",
    body = null
) {

    const options = {

        method:
            method,

        headers:
            getAuthHeaders(),

        cache:
            "no-store"

    };


    if (
        body !== null
    ) {

        options.body =
            JSON.stringify(
                body
            );

    }


    const response =
        await fetch(
            API_URL + url,
            options
        );


    let data = {};


    try {

        data =
            await response.json();

    } catch (error) {

        data = {};

    }


    if (
        response.status ===
        401
    ) {

        throw new Error(
            "Authentication expired. Please login again."
        );

    }


    if (!response.ok) {

        throw new Error(

            data.message ||
            "Request failed."

        );

    }


    return data;
}


// ======================================================
// ADMIN API
// ======================================================

async function adminApi(
    url,
    method = "GET",
    body = null
) {

    const options = {

        method:
            method,

        headers:
            getAuthHeaders(
                true
            ),

        cache:
            "no-store"

    };


    if (
        body !== null
    ) {

        options.body =
            JSON.stringify(
                body
            );

    }


    const response =
        await fetch(
            API_URL + url,
            options
        );


    let data = {};


    try {

        data =
            await response.json();

    } catch (error) {

        data = {};

    }


    if (
        response.status ===
        401
    ) {

        throw new Error(
            "Authentication expired. Please login again."
        );

    }


    if (
        response.status ===
        403
    ) {

        throw new Error(
            data.message ||
            "Admin authorization required."
        );

    }


    if (!response.ok) {

        throw new Error(

            data.message ||
            "Admin request failed."

        );

    }


    return data;
}


// ======================================================
// LOAD USER FROM SERVER
// ======================================================

async function fetchCurrentUser() {

    const token =
        getAuthToken();

    if (!token) {

        throw new Error(
            "Login required."
        );

    }


    const savedUser =
        getCurrentUser();


    if (
        !savedUser ||
        !savedUser.id
    ) {

        const data =
            await apiRequest(
                "/me"
            );

        if (
            data.user
        ) {

            saveCurrentUser(
                data.user
            );

            return data.user;
        }

        throw new Error(
            "User information not found."
        );
    }


    const data =
        await apiRequest(

            "/user/" +
            encodeURIComponent(
                savedUser.id
            )

        );


    if (
        data.user
    ) {

        saveCurrentUser(
            data.user
        );

        return data.user;
    }


    throw new Error(
        "Unable to load user."
    );
}


// ======================================================
// LOAD WALLET
// ======================================================

async function fetchWallet() {

    return await apiRequest(
        "/wallet"
    );
}


// ======================================================
// LOAD MARKET
// ======================================================

async function fetchMarket() {

    return await fetch(
        API_URL +
        "/market",
        {
            method:
                "GET",
            cache:
                "no-store"
        }
    ).then(
        async response => {

            let data = {};

            try {

                data =
                    await response.json();

            } catch (error) {

                data = {};

            }


            if (!response.ok) {

                throw new Error(

                    data.message ||
                    "Unable to load market."

                );

            }


            return data;

        }
    );
}


// ======================================================
// LOAD PAYMENT SETTINGS
// ======================================================

async function fetchPaymentSettings() {

    return await fetch(
        API_URL +
        "/payment-settings",
        {
            method:
                "GET",
            cache:
                "no-store"
        }
    ).then(
        async response => {

            let data = {};

            try {

                data =
                    await response.json();

            } catch (error) {

                data = {};

            }


            if (!response.ok) {

                throw new Error(

                    data.message ||
                    "Unable to load payment settings."

                );

            }


            return data;

        }
    );
}


// ======================================================
// SUBMIT DEPOSIT
// ======================================================

async function submitDeposit(
    amount,
    method,
    reference
) {

    return await apiRequest(

        "/wallet/deposit",

        "POST",

        {

            amount:
                amount,

            method:
                method,

            reference:
                reference

        }

    );

}


// ======================================================
// SUBMIT WITHDRAWAL
// ======================================================

async function submitWithdrawal(
    amount,
    method,
    account
) {

    return await apiRequest(

        "/wallet/withdraw",

        "POST",

        {

            amount:
                amount,

            method:
                method,

            account:
                account

        }

    );

}


// ======================================================
// SUBMIT TRADE
// ======================================================

async function submitTradeRequest(
    symbol,
    type,
    amount,
    duration
) {

    return await apiRequest(

        "/trade",

        "POST",

        {

            symbol:
                symbol,

            type:
                type,

            amount:
                amount,

            duration:
                duration

        }

    );

}


// ======================================================
// GET SINGLE TRADE
// ======================================================

async function fetchTrade(
    tradeId
) {

    return await apiRequest(

        "/trade/" +
        encodeURIComponent(
            tradeId
        )

    );

}


// ======================================================
// ADMIN USERS
// ======================================================

async function fetchAdminUsers() {

    return await adminApi(
        "/users"
    );
}


// ======================================================
// ADMIN ADD BALANCE
// ======================================================

async function adminAddBalance(
    userId,
    amount
) {

    return await adminApi(

        "/admin/add-balance",

        "POST",

        {

            userId:
                userId,

            amount:
                amount

        }

    );

}


// ======================================================
// ADMIN REMOVE BALANCE
// ======================================================

async function adminRemoveBalance(
    userId,
    amount
) {

    return await adminApi(

        "/admin/remove-balance",

        "POST",

        {

            userId:
                userId,

            amount:
                amount

        }

    );

}


// ======================================================
// ADMIN MARKET CONTROL
// ======================================================

async function fetchAdminMarketControl() {

    return await adminApi(
        "/admin/market-control"
    );
}


// ======================================================
// SET MARKET MODE
// ======================================================

async function adminSetMarketMode(
    mode
) {

    return await adminApi(

        "/admin/market-control/mode",

        "POST",

        {

            mode:
                mode

        }

    );

}


// ======================================================
// SET ADMIN COIN PRICE
// ======================================================

async function adminSetCoinPrice(
    symbol,
    price
) {

    return await adminApi(

        "/admin/market-control/price",

        "POST",

        {

            symbol:
                symbol,

            price:
                price

        }

    );

}


// ======================================================
// SET ALL ADMIN PRICES
// ======================================================

async function adminSetAllPrices(
    prices
) {

    return await adminApi(

        "/admin/market-control/prices",

        "POST",

        prices

    );

}


// ======================================================
// ADMIN PAYMENT SETTINGS
// ======================================================

async function fetchAdminPaymentSettings() {

    return await adminApi(
        "/admin/payment-settings"
    );
}


async function saveAdminPaymentSettings(
    settings
) {

    return await adminApi(

        "/admin/payment-settings",

        "POST",

        settings

    );

}


// ======================================================
// ADMIN DEPOSITS
// ======================================================

async function fetchAdminDeposits() {

    return await adminApi(
        "/admin/deposits"
    );
}


// ======================================================
// ADMIN WITHDRAWALS
// ======================================================

async function fetchAdminWithdrawals() {

    return await adminApi(
        "/admin/withdrawals"
    );
}


// ======================================================
// APPROVE WITHDRAWAL
// ======================================================

async function approveAdminWithdrawal(
    withdrawalId,
    note = ""
) {

    return await adminApi(

        "/admin/withdrawal/" +

        encodeURIComponent(
            withdrawalId
        ) +

        "/approve",

        "POST",

        {

            note:
                note

        }

    );

}


// ======================================================
// REJECT WITHDRAWAL
// ======================================================

async function rejectAdminWithdrawal(
    withdrawalId,
    note = ""
) {

    return await adminApi(

        "/admin/withdrawal/" +

        encodeURIComponent(
            withdrawalId
        ) +

        "/reject",

        "POST",

        {

            note:
                note

        }

    );

}


// ======================================================
// SAFE NUMBER
// ======================================================

function numberValue(
    value,
    fallback = 0
) {

    const number =
        Number(
            value
        );


    return Number.isFinite(
        number
    )
        ? number
        : fallback;

}


// ======================================================
// FORMAT DATE
// ======================================================

function formatDate(
    value
) {

    if (!value) {
        return "-";
    }


    const date =
        new Date(
            value
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "-";

    }


    return date.toLocaleString();

}


// ======================================================
// STATUS CLASS
// ======================================================

function statusClass(
    status
) {

    const clean =
        String(
            status || ""
        )
            .trim()
            .toLowerCase();


    if (
        clean ===
        "approved"
    ) {

        return "approved";
    }


    if (
        clean ===
        "rejected"
    ) {

        return "rejected";
    }


    if (
        clean ===
        "completed"
    ) {

        return "completed";
    }


    if (
        clean ===
        "submitted"
    ) {

        return "submitted";
    }


    return "pending";
}


// ======================================================
// SET TEXT SAFELY
// ======================================================

function setText(
    selector,
    value
) {

    const element =
        document.querySelector(
            selector
        );


    if (!element) {
        return;
    }


    element.textContent =
        value ?? "";
}


// ======================================================
// PAGE CONNECTION CHECK
// ======================================================

async function checkBackend() {

    try {

        const response =
            await fetch(
                API_URL + "/",
                {
                    method:
                        "GET",
                    cache:
                        "no-store"
                }
            );


        return response.ok;

    } catch (error) {

        console.error(
            "Backend check error:",
            error
        );

        return false;

    }

}


// ======================================================
// AUTO AUTH CHECK
// ======================================================
//
// Only protects pages that explicitly call this function.
// It does NOT continuously redirect/reload.
//

function protectPage() {

    if (
        !isLoggedIn()
    ) {

        window.location.href =
            "/login.html";

        return false;
    }

    return true;
}


// ======================================================
// ADMIN PAGE CHECK
// ======================================================

function protectAdminPage() {

    if (
        !isLoggedIn()
    ) {

        window.location.href =
            "/login.html";

        return false;
    }


    return true;
}


// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

window.addEventListener(
    "unhandledrejection",
    function(event) {

        console.error(
            "Unhandled promise rejection:",
            event.reason
        );

    }
);


// ======================================================
// EXPORT GLOBAL FUNCTIONS
// ======================================================
//
// Normal browser script files already expose top-level
// functions globally. These assignments make the intended
// API explicit.
//

window.getAuthToken =
    getAuthToken;

window.getAuthHeaders =
    getAuthHeaders;

window.getCurrentUser =
    getCurrentUser;

window.saveCurrentUser =
    saveCurrentUser;

window.isLoggedIn =
    isLoggedIn;

window.requireLogin =
    requireLogin;

window.logout =
    logout;

window.esc =
    esc;

window.money =
    money;

window.apiRequest =
    apiRequest;

window.adminApi =
    adminApi;

window.fetchCurrentUser =
    fetchCurrentUser;

window.fetchWallet =
    fetchWallet;

window.fetchMarket =
    fetchMarket;

window.fetchPaymentSettings =
    fetchPaymentSettings;

window.submitDeposit =
    submitDeposit;

window.submitWithdrawal =
    submitWithdrawal;

window.submitTradeRequest =
    submitTradeRequest;

window.fetchTrade =
    fetchTrade;

window.fetchAdminUsers =
    fetchAdminUsers;

window.adminAddBalance =
    adminAddBalance;

window.adminRemoveBalance =
    adminRemoveBalance;

window.fetchAdminMarketControl =
    fetchAdminMarketControl;

window.adminSetMarketMode =
    adminSetMarketMode;

window.adminSetCoinPrice =
    adminSetCoinPrice;

window.adminSetAllPrices =
    adminSetAllPrices;

window.fetchAdminPaymentSettings =
    fetchAdminPaymentSettings;

window.saveAdminPaymentSettings =
    saveAdminPaymentSettings;

window.fetchAdminDeposits =
    fetchAdminDeposits;

window.fetchAdminWithdrawals =
    fetchAdminWithdrawals;

window.approveAdminWithdrawal =
    approveAdminWithdrawal;

window.rejectAdminWithdrawal =
    rejectAdminWithdrawal;

window.numberValue =
    numberValue;

window.formatDate =
    formatDate;

window.statusClass =
    statusClass;

window.setText =
    setText;

window.checkBackend =
    checkBackend;

window.protectPage =
    protectPage;

window.protectAdminPage =
    protectAdminPage;