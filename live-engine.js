"use strict";

/*
==========================================================
KrakenCoin - Live Engine
==========================================================

Features:
- Real BTC/USDT candles
- Binance WebSocket live updates
- Server market mode
- REAL mode
- ADMIN mode
- Admin-controlled price
- Safe WebSocket reconnect
- No browser reload
- No duplicate WebSocket
- No duplicate chart
- No duplicate intervals
- Dashboard compatible
==========================================================
*/


// ========================================================
// CONFIG
// ========================================================

const LIVE_ENGINE_API =
    (typeof API_URL !== "undefined")
        ? API_URL
        : ((typeof window !== "undefined" && window.location.protocol.startsWith("http") && true)
            ? window.location.origin
            : "http://localhost:3000");

const LIVE_ENGINE_KLINES_URL =
    "https://api.binance.com/api/v3/klines";

const LIVE_ENGINE_WS_URL =
    "wss://stream.binance.com:9443/ws/btcusdt@kline_1m";

const LIVE_ENGINE_SYMBOL =
    "BTCUSDT";

const LIVE_ENGINE_INTERVAL =
    "1m";

const LIVE_ENGINE_LIMIT =
    300;

const LIVE_ENGINE_SERVER_REFRESH =
    5000;

const LIVE_ENGINE_RECONNECT_DELAY =
    3000;


// ========================================================
// ENGINE STATE
// ========================================================

let liveChart = null;

let liveCandleSeries = null;

let liveSocket = null;

let liveCandles = [];

let liveMarketMode = "REAL";

let liveServerPrice = 0;

let liveRealPrice = 0;

let liveAdminPrice = 0;

let liveReconnectTimer = null;

let liveServerRefreshTimer = null;

let liveStarted = false;

let liveDestroyed = false;

let liveSocketGeneration = 0;


// ========================================================
// NUMBER HELPER
// ========================================================

function liveNumber(value, fallback = 0) {

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;

}


// ========================================================
// ROUND HELPER
// ========================================================

function liveRound(value) {

    return Number(
        liveNumber(value).toFixed(2)
    );

}


// ========================================================
// LOG
// ========================================================

function liveLog(...args) {

    console.log(
        "[KrakenCoin Live Engine]",
        ...args
    );

}


// ========================================================
// GET EFFECTIVE PRICE
// ========================================================

function liveGetEffectivePrice() {

    /*
    ADMIN MODE
    Server/admin price always wins.
    */

    if (liveMarketMode === "ADMIN") {

        if (liveServerPrice > 0) {

            return liveServerPrice;

        }

        if (liveAdminPrice > 0) {

            return liveAdminPrice;

        }

    }


    /*
    REAL MODE
    Binance real price.
    */

    if (liveRealPrice > 0) {

        return liveRealPrice;

    }


    /*
    Final fallback.
    */

    return liveServerPrice;

}


// ========================================================
// UPDATE PRICE DISPLAY
// ========================================================

function liveUpdatePriceDisplay() {

    const price =
        liveGetEffectivePrice();


    /*
    Dashboard global price.
    */

    try {

        if (
            typeof currentMarketPrice !==
            "undefined"
        ) {

            currentMarketPrice =
                price;

        }

    } catch (error) {

        // Ignore if dashboard variable does not exist.

    }


    /*
    BTC price element.
    */

    const btcPrice =
        document.getElementById(
            "btcPrice"
        );


    if (btcPrice) {

        btcPrice.textContent =
            "$" +
            liveNumber(
                price
            ).toLocaleString(
                "en-US",
                {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }
            );

    }


    /*
    Open trade current price.
    */

    const openTradeCurrent =
        document.getElementById(
            "openTradeCurrent"
        );


    if (openTradeCurrent) {

        openTradeCurrent.textContent =
            "$" +
            liveNumber(
                price
            ).toLocaleString(
                "en-US",
                {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }
            );

    }

}


// ========================================================
// UPDATE MARKET MODE DISPLAY
// ========================================================

function liveUpdateModeDisplay() {

    const element =
        document.getElementById(
            "marketMode"
        );


    if (!element) {

        return;

    }


    if (
        liveMarketMode ===
        "ADMIN"
    ) {

        element.textContent =
            "Market mode: ADMIN CONTROL";

        element.className =
            "market-mode admin";

    } else {

        element.textContent =
            "Market mode: REAL MARKET";

        element.className =
            "market-mode";

    }

}


// ========================================================
// LOAD SERVER MARKET
// ========================================================

async function liveLoadServerMarket() {

    if (liveDestroyed) {

        return false;

    }


    try {

        const response =
            await fetch(

                LIVE_ENGINE_API +
                "/market",

                {
                    method: "GET",
                    cache: "no-store"
                }

            );


        if (!response.ok) {

            throw new Error(
                "Market API HTTP " +
                response.status
            );

        }


        const data =
            await response.json();


        if (
            !data ||
            !data.success ||
            !data.data
        ) {

            throw new Error(
                "Invalid market response."
            );

        }


        /*
        Read server mode.
        */

        liveMarketMode =
            data.mode === "ADMIN"
                ? "ADMIN"
                : "REAL";


        /*
        Read coin object matching symbol.
        */

        const symbolKey =
            (typeof LIVE_ENGINE_SYMBOL !== "undefined" && LIVE_ENGINE_SYMBOL)
                ? LIVE_ENGINE_SYMBOL.replace("USDT", "").toUpperCase()
                : "BTC";

        const btc =
            data.data[symbolKey] ||
            data.data.BTC;


        if (btc) {

            const serverPrice =
                liveNumber(
                    btc.price
                );


            const realPrice =
                liveNumber(
                    btc.realPrice
                );


            if (
                serverPrice > 0
            ) {

                liveServerPrice =
                    serverPrice;

            }


            if (
                realPrice > 0
            ) {

                liveRealPrice =
                    realPrice;

            }


            /*
            If server says ADMIN,
            remember admin price.
            */

            if (
                btc.source ===
                "ADMIN" ||
                liveMarketMode === "ADMIN"
            ) {

                if (
                    serverPrice > 0
                ) {

                    liveAdminPrice =
                        serverPrice;

                }

            }

        }


        liveUpdateModeDisplay();

        liveUpdatePriceDisplay();


        /*
        ADMIN chart synchronization.
        */

        if (
            liveMarketMode ===
            "ADMIN"
        ) {

            liveSyncAdminCandle();

        }


        return true;


    } catch (error) {

        liveLog(
            "Server market error:",
            error.message
        );

        return false;

    }

}


// ========================================================
// LOAD HISTORICAL CANDLES
// ========================================================

async function liveLoadCandles() {

    if (
        !liveCandleSeries ||
        liveDestroyed
    ) {

        return false;

    }


    try {

        const response =
            await fetch(

                LIVE_ENGINE_KLINES_URL +

                "?symbol=" +
                LIVE_ENGINE_SYMBOL +

                "&interval=" +
                LIVE_ENGINE_INTERVAL +

                "&limit=" +
                LIVE_ENGINE_LIMIT,

                {
                    method: "GET",
                    cache: "no-store"
                }

            );


        if (!response.ok) {

            throw new Error(
                "Binance candle request failed."
            );

        }


        const data =
            await response.json();


        if (
            !Array.isArray(data) ||
            data.length === 0
        ) {

            throw new Error(
                "No Binance candles received."
            );

        }


        /*
        Convert Binance candles.
        */

        const candles =
            data.map(
                function(item) {

                    return {

                        time:
                            Number(
                                item[0]
                            ) / 1000,

                        open:
                            Number(
                                item[1]
                            ),

                        high:
                            Number(
                                item[2]
                            ),

                        low:
                            Number(
                                item[3]
                            ),

                        close:
                            Number(
                                item[4]
                            )

                    };

                }
            );


        /*
        Store candles.
        */

        liveCandles =
            candles;


        /*
        Put candles into chart.
        */

        liveCandleSeries.setData(
            liveCandles
        );


        /*
        Latest real Binance price.
        */

        const latest =
            liveCandles[
                liveCandles.length - 1
            ];


        if (latest) {

            liveRealPrice =
                liveNumber(
                    latest.close
                );


            /*
            Only use Binance price
            as server price in REAL mode.
            */

            if (
                liveMarketMode ===
                "REAL"
            ) {

                liveServerPrice =
                    liveRealPrice;

            }

        }


        /*
        Fit chart.
        */

        if (liveChart) {

            liveChart
                .timeScale()
                .fitContent();

        }


        liveUpdatePriceDisplay();


        liveLog(
            "Loaded",
            liveCandles.length,
            "candles."
        );


        return true;


    } catch (error) {

        liveLog(
            "Candle loading error:",
            error.message
        );

        return false;

    }

}


// ========================================================
// UPDATE CANDLE
// ========================================================

function liveUpdateCandle(candle) {

    if (
        !liveCandleSeries ||
        !candle
    ) {

        return;

    }


    const normalizedCandle = {

        time:
            Number(
                candle.time
            ),

        open:
            liveRound(
                candle.open
            ),

        high:
            liveRound(
                candle.high
            ),

        low:
            liveRound(
                candle.low
            ),

        close:
            liveRound(
                candle.close
            )

    };


    /*
    Ignore invalid candle.
    */

    if (
        !Number.isFinite(
            normalizedCandle.time
        )
    ) {

        return;

    }


    /*
    Update chart.
    */

    liveCandleSeries.update(
        normalizedCandle
    );


    /*
    Update local candle array.
    */

    const lastIndex =
        liveCandles.length - 1;


    const last =
        liveCandles[
            lastIndex
        ];


    if (
        last &&
        Number(last.time) ===
        Number(
            normalizedCandle.time
        )
    ) {

        liveCandles[
            lastIndex
        ] =
            normalizedCandle;

    } else {

        /*
        Make sure candles remain
        chronological.
        */

        if (
            !last ||
            Number(
                normalizedCandle.time
            ) >
            Number(last.time)
        ) {

            liveCandles.push(
                normalizedCandle
            );

        }

    }


    /*
    Keep array limited.
    */

    while (
        liveCandles.length >
        LIVE_ENGINE_LIMIT
    ) {

        liveCandles.shift();

    }

}


// ========================================================
// CREATE CHART
// ========================================================

function liveCreateChart() {

    const element =
        document.getElementById(
            "chart"
        );


    if (!element) {

        liveLog(
            "Chart element not found."
        );

        return false;

    }


    /*
    Check Lightweight Charts.
    */

    if (
        typeof LightweightCharts ===
        "undefined"
    ) {

        liveLog(
            "LightweightCharts library not loaded."
        );

        return false;

    }


    /*
    IMPORTANT:
    Never create second chart.
    */

    if (
        liveChart &&
        liveCandleSeries
    ) {

        return true;

    }


    /*
    If another chart instance
    was somehow attached,
    clean it first.
    */

    if (liveChart) {

        try {

            liveChart.remove();

        } catch (error) {}

        liveChart =
            null;

        liveCandleSeries =
            null;

    }


    /*
    Create chart.
    */

    liveChart =
        LightweightCharts.createChart(

            element,

            {

                width:
                    element.clientWidth,

                height:
                    500,

                layout: {

                    background: {
                        color: "#111111"
                    },

                    textColor:
                        "#cccccc"

                },

                grid: {

                    vertLines: {
                        color: "#222222"
                    },

                    horzLines: {
                        color: "#222222"
                    }

                },

                crosshair: {

                    mode: 1

                },

                rightPriceScale: {

                    borderColor:
                        "#333333",

                    autoScale:
                        true,

                    scaleMargins: {

                        top:
                            0.10,

                        bottom:
                            0.10

                    }

                },

                timeScale: {

                    timeVisible:
                        true,

                    secondsVisible:
                        false,

                    borderColor:
                        "#333333",

                    barSpacing:
                        8,

                    rightOffset:
                        8,

                    fixLeftEdge:
                        false,

                    fixRightEdge:
                        false

                },

                handleScroll: {

                    mouseWheel:
                        true,

                    pressedMouseMove:
                        true,

                    horzTouchDrag:
                        true,

                    vertTouchDrag:
                        true

                },

                handleScale: {

                    mouseWheel:
                        true,

                    pinch:
                        true,

                    axisPressedMouseMove: {

                        time:
                            true,

                        price:
                            true

                    }

                }

            }

        );


    /*
    Candlestick series.
    */

    liveCandleSeries =
        liveChart.addCandlestickSeries({

            upColor:
                "#00c853",

            downColor:
                "#d60000",

            borderUpColor:
                "#00c853",

            borderDownColor:
                "#d60000",

            wickUpColor:
                "#00c853",

            wickDownColor:
                "#d60000"

        });


    /*
    Resize listener only once.
    */

    window.addEventListener(
        "resize",
        liveResizeChart
    );


    liveLog(
        "Chart created."
    );


    return true;

}


// ========================================================
// RESIZE CHART
// ========================================================

function liveResizeChart() {

    if (!liveChart) {

        return;

    }


    const element =
        document.getElementById(
            "chart"
        );


    if (!element) {

        return;

    }


    const width =
        element.clientWidth;


    if (width <= 0) {

        return;

    }


    try {

        liveChart.applyOptions({

            width:
                width

        });

    } catch (error) {

        liveLog(
            "Chart resize error:",
            error.message
        );

    }

}


// ========================================================
// REAL BINANCE WEBSOCKET
// ========================================================

function liveConnectWebSocket() {

    if (liveDestroyed) {

        return;

    }


    /*
    IMPORTANT:
    Don't create duplicate WebSocket.
    */

    if (
        liveSocket &&
        (
            liveSocket.readyState ===
                WebSocket.OPEN ||

            liveSocket.readyState ===
                WebSocket.CONNECTING
        )
    ) {

        liveLog(
            "WebSocket already active."
        );

        return;

    }


    /*
    Cancel pending reconnect.
    */

    if (liveReconnectTimer) {

        clearTimeout(
            liveReconnectTimer
        );

        liveReconnectTimer =
            null;

    }


    /*
    Increase socket generation.
    */

    const generation =
        ++liveSocketGeneration;


    let socket;


    try {

        socket =
            new WebSocket(
                LIVE_ENGINE_WS_URL
            );

    } catch (error) {

        liveLog(
            "WebSocket creation error:",
            error.message
        );

        liveScheduleReconnect(
            generation
        );

        return;

    }


    liveSocket =
        socket;


    /*
    OPEN.
    */

    socket.onopen =
        function() {

            if (
                generation !==
                liveSocketGeneration
            ) {

                return;

            }

            liveLog(
                "Binance WebSocket connected."
            );

        };


    /*
    MESSAGE.
    */

    socket.onmessage =
        function(event) {

            if (
                liveDestroyed ||
                generation !==
                liveSocketGeneration
            ) {

                return;

            }


            try {

                const message =
                    JSON.parse(
                        event.data
                    );


                if (!message.k) {

                    return;

                }


                const k =
                    message.k;


                const candle = {

                    time:
                        Number(
                            k.t
                        ) / 1000,

                    open:
                        Number(
                            k.o
                        ),

                    high:
                        Number(
                            k.h
                        ),

                    low:
                        Number(
                            k.l
                        ),

                    close:
                        Number(
                            k.c
                        )

                };


                /*
                Save REAL Binance price.
                */

                liveRealPrice =
                    liveNumber(
                        candle.close
                    );


                /*
                REAL mode.
                */

                if (
                    liveMarketMode ===
                    "REAL"
                ) {

                    liveServerPrice =
                        liveRealPrice;


                    liveUpdatePriceDisplay();


                    liveUpdateCandle(
                        candle
                    );

                }


                /*
                ADMIN mode:
                Binance does NOT update
                the visible chart price.
                */

            } catch (error) {

                liveLog(
                    "WebSocket message error:",
                    error.message
                );

            }

        };


    /*
    ERROR.
    */

    socket.onerror =
        function() {

            if (
                generation !==
                liveSocketGeneration
            ) {

                return;

            }

            liveLog(
                "Binance WebSocket error."
            );

        };


    /*
    CLOSE.
    */

    socket.onclose =
        function() {

            if (
                generation !==
                liveSocketGeneration
            ) {

                return;

            }


            /*
            Clear current socket.
            */

            if (
                liveSocket ===
                socket
            ) {

                liveSocket =
                    null;

            }


            if (!liveDestroyed) {

                liveLog(
                    "Binance WebSocket disconnected."
                );


                liveScheduleReconnect(
                    generation
                );

            }

        };

}


// ========================================================
// SAFE RECONNECT
// ========================================================

function liveScheduleReconnect(
    generation
) {

    if (liveDestroyed) {

        return;

    }


    /*
    Don't create multiple
    reconnect timers.
    */

    if (liveReconnectTimer) {

        return;

    }


    liveReconnectTimer =
        setTimeout(

            function() {

                liveReconnectTimer =
                    null;


                if (
                    liveDestroyed
                ) {

                    return;

                }


                if (
                    generation !==
                    liveSocketGeneration
                ) {

                    return;

                }


                liveConnectWebSocket();

            },

            LIVE_ENGINE_RECONNECT_DELAY

        );

}


// ========================================================
// ADMIN CANDLE
// ========================================================

function liveSyncAdminCandle() {

    if (
        liveDestroyed ||
        liveMarketMode !==
        "ADMIN"
    ) {

        return;

    }


    const price =
        liveGetEffectivePrice();


    if (
        !Number.isFinite(price) ||
        price <= 0
    ) {

        return;

    }


    /*
    Current 1-minute candle.
    */

    const currentMinute =
        Math.floor(
            Date.now() / 60000
        ) * 60;


    let last =
        liveCandles[
            liveCandles.length - 1
        ];


    /*
    If no candle or new minute,
    create new candle.
    */

    if (
        !last ||
        Number(last.time) !==
        Number(currentMinute)
    ) {

        const previousClose =
            last
                ? liveNumber(
                    last.close
                )
                : price;


        const newCandle = {

            time:
                currentMinute,

            open:
                previousClose,

            high:
                Math.max(
                    previousClose,
                    price
                ),

            low:
                Math.min(
                    previousClose,
                    price
                ),

            close:
                price

        };


        liveUpdateCandle(
            newCandle
        );

    } else {

        /*
        Update current admin candle.
        */

        const updatedCandle = {

            time:
                Number(
                    last.time
                ),

            open:
                liveNumber(
                    last.open
                ),

            high:
                Math.max(
                    liveNumber(
                        last.high
                    ),
                    price
                ),

            low:
                Math.min(
                    liveNumber(
                        last.low
                    ),
                    price
                ),

            close:
                price

        };


        liveUpdateCandle(
            updatedCandle
        );

    }


    liveUpdatePriceDisplay();

}


// ========================================================
// START SERVER POLLING
// ========================================================

function liveStartServerPolling() {

    /*
    Never create duplicate interval.
    */

    if (
        liveServerRefreshTimer
    ) {

        return;

    }


    liveServerRefreshTimer =
        setInterval(

            function() {

                if (
                    liveDestroyed
                ) {

                    return;

                }


                if (
                    document.hidden
                ) {

                    return;

                }


                liveLoadServerMarket();

            },

            LIVE_ENGINE_SERVER_REFRESH

        );

}


// ========================================================
// STOP SERVER POLLING
// ========================================================

function liveStopServerPolling() {

    if (
        liveServerRefreshTimer
    ) {

        clearInterval(
            liveServerRefreshTimer
        );

        liveServerRefreshTimer =
            null;

    }

}


// ========================================================
// START ENGINE
// ========================================================

async function startLiveEngine() {

    /*
    Prevent duplicate engine.
    */

    if (liveStarted) {

        liveLog(
            "Engine already started."
        );

        return;

    }


    if (liveDestroyed) {

        /*
        Allow restarting after stop.
        */

        liveDestroyed =
            false;

    }


    liveStarted =
        true;


    liveLog(
        "Starting Live Engine..."
    );


    /*
    1. Create chart.
    */

    liveCreateChart();


    /*
    2. Load server market.
    */

    await liveLoadServerMarket();


    /*
    3. Load Binance historical candles.
    */

    await liveLoadCandles();


    /*
    4. Connect WebSocket.
    */

    liveConnectWebSocket();


    /*
    5. Start only ONE server interval.
    */

    liveStartServerPolling();


    /*
    6. If ADMIN mode,
    immediately synchronize chart.
    */

    if (
        liveMarketMode ===
        "ADMIN"
    ) {

        liveSyncAdminCandle();

    }


    liveLog(
        "Live Engine started successfully."
    );

}


// ========================================================
// STOP ENGINE
// ========================================================

function stopLiveEngine() {

    if (
        !liveStarted &&
        liveDestroyed
    ) {

        return;

    }


    liveDestroyed =
        true;

    liveStarted =
        false;


    /*
    Stop server polling.
    */

    liveStopServerPolling();


    /*
    Stop reconnect timer.
    */

    if (
        liveReconnectTimer
    ) {

        clearTimeout(
            liveReconnectTimer
        );

        liveReconnectTimer =
            null;

    }


    /*
    Invalidate old sockets.
    */

    liveSocketGeneration++;


    /*
    Close WebSocket.
    */

    if (liveSocket) {

        try {

            liveSocket.onopen =
                null;

            liveSocket.onmessage =
                null;

            liveSocket.onerror =
                null;

            liveSocket.onclose =
                null;

            liveSocket.close();

        } catch (error) {}

        liveSocket =
            null;

    }


    /*
    Remove resize listener.
    */

    window.removeEventListener(
        "resize",
        liveResizeChart
    );


    /*
    Remove chart.
    */

    if (liveChart) {

        try {

            liveChart.remove();

        } catch (error) {}

    }


    liveChart =
        null;

    liveCandleSeries =
        null;

    liveCandles =
        [];


    liveLog(
        "Live Engine stopped."
    );

}


// ========================================================
// PUBLIC API
// ========================================================

window.startLiveEngine =
    startLiveEngine;

window.stopLiveEngine =
    stopLiveEngine;

window.liveLoadServerMarket =
    liveLoadServerMarket;

window.liveLoadCandles =
    liveLoadCandles;

window.liveConnectWebSocket =
    liveConnectWebSocket;

window.liveGetEffectivePrice =
    liveGetEffectivePrice;

window.liveSyncAdminCandle =
    liveSyncAdminCandle;


// ========================================================
// AUTO START
// ========================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        function() {

            startLiveEngine();

        },
        {
            once: true
        }
    );

} else {

    startLiveEngine();

}


// ========================================================
// PAGE CLEANUP
// ========================================================

window.addEventListener(
    "pagehide",
    function() {

        stopLiveEngine();

    },
    {
        once: true
    }
);