// --- CONFIGURATION ---
const FINNHUB_API_KEY = "d5hrk4hr01qu7bqpkf4gd5hrk4hr01qu7bqpkf50"; 

let currentPrice = 100;
let currentIV = 0.30; // Default to 30% if data unavailable

// --- MATH & BLACK-SCHOLES LOGIC ---

// Standard Normal Cumulative Distribution Function
function normalCDF(x) {
    var t = 1 / (1 + .2316419 * Math.abs(x));
    var d = .3989423 * Math.exp(-x * x / 2);
    var prob = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    if (x > 0) prob = 1 - prob;
    return prob;
}

// Black-Scholes Formula
function blackScholes(S, K, T, r, sigma, type) {
    if (T <= 0) {
        return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
    }
    var d1 = (Math.log(S / K) + (r + 0.5 * Math.pow(sigma, 2)) * T) / (sigma * Math.sqrt(T));
    var d2 = d1 - sigma * Math.sqrt(T);
    
    if (type === 'call') {
        return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    } else {
        return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
    }
}

// --- APP FUNCTIONS ---

async function fetchStock() {
    const ticker = document.getElementById('tickerInput').value.toUpperCase();
    if(!ticker) return;

    const btn = document.querySelector('button[onclick="fetchStock()"]');
    const oldText = btn.innerText;
    btn.innerText = "Loading...";

    try {
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`);
        const data = await response.json();
        
        if (data.c) { // 'c' is current price
            currentPrice = data.c;
            document.getElementById('currentPrice').innerText = currentPrice.toFixed(2);
            // Refresh strategy with new price
            loadStrategy(); 
        } else {
            alert("Symbol not found or API limit reached.");
        }
    } catch (e) {
        console.error(e);
        alert("Error fetching data.");
    }
    btn.innerText = oldText;
}

const strategies = {
    'long_call': [{type: 'call', action: 'buy'}],
    'long_put': [{type: 'put', action: 'buy'}],
    'covered_call': [{type: 'stock', action: 'buy'}, {type: 'call', action: 'sell'}],
    'cash_secured_put': [{type: 'put', action: 'sell'}], // Usually cash secured implies selling a put
    'bull_call_spread': [
        {type: 'call', action: 'buy', strike_offset: 0},
        {type: 'call', action: 'sell', strike_offset: 5}
    ],
    'bear_put_spread': [
        {type: 'put', action: 'buy', strike_offset: 0},
        {type: 'put', action: 'sell', strike_offset: -5}
    ],
    'iron_condor': [
        {type: 'put', action: 'buy', strike_offset: -10},
        {type: 'put', action: 'sell', strike_offset: -5},
        {type: 'call', action: 'sell', strike_offset: 5},
        {type: 'call', action: 'buy', strike_offset: 10}
    ],
    'straddle': [
        {type: 'call', action: 'buy', strike_offset: 0},
        {type: 'put', action: 'buy', strike_offset: 0}
    ],
    'strangle': [
        {type: 'put', action: 'buy', strike_offset: -5},
        {type: 'call', action: 'buy', strike_offset: 5}
    ]
};

function loadStrategy() {
    const strat = document.getElementById('strategySelect').value;
    const container = document.getElementById('legsContainer');
    container.innerHTML = ''; 

    if (strategies[strat]) {
        strategies[strat].forEach(leg => {
            addLeg(leg.type, leg.action, leg.strike_offset);
        });
    } else {
        // Default
        addLeg('call', 'buy', 0);
    }
}

function addLeg(type='call', action='buy', offset=0) {
    const container = document.getElementById('legsContainer');
    const id = Date.now() + Math.random();
    // Calculate strike based on offset from current price
    const strike = (currentPrice + (offset || 0)).toFixed(2);

    const html = `
    <div class="leg-card" id="leg-${id}">
        <span class="btn-remove" onclick="removeLeg('${id}')">✕</span>
        <div class="row g-1">
            <div class="col-4">
                <select class="form-select form-select-sm leg-action">
                    <option value="buy" ${action=='buy'?'selected':''}>Buy</option>
                    <option value="sell" ${action=='sell'?'selected':''}>Sell</option>
                </select>
            </div>
            <div class="col-4">
                <select class="form-select form-select-sm leg-type">
                    <option value="call" ${type=='call'?'selected':''}>Call</option>
                    <option value="put" ${type=='put'?'selected':''}>Put</option>
                    <option value="stock" ${type=='stock'?'selected':''}>Stock</option>
                </select>
            </div>
            <div class="col-4">
                <input type="number" class="form-control form-control-sm leg-qty" value="1" placeholder="Qty">
            </div>
            <div class="col-6 mt-1">
                <label class="text-secondary" style="font-size:0.7rem">Strike</label>
                <input type="number" class="form-control form-control-sm leg-strike" value="${strike}">
            </div>
            <div class="col-6 mt-1">
                <label class="text-secondary" style="font-size:0.7rem">Premium</label>
                <input type="number" class="form-control form-control-sm leg-premium" value="2.00">
            </div>
            <div class="col-6 mt-1">
                <label class="text-secondary" style="font-size:0.7rem">Days to Exp</label>
                <input type="number" class="form-control form-control-sm leg-days" value="30">
            </div>
            <div class="col-6 mt-1">
                <label class="text-secondary" style="font-size:0.7rem">IV (0.3=30%)</label>
                <input type="number" class="form-control form-control-sm leg-iv" value="${currentIV}">
            </div>
        </div>
    </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

function removeLeg(id) {
    document.getElementById(`leg-${id}`).remove();
}

function calculateProfit() {
    // 1. Gather Inputs
    const legs = [];
    let maxDays = 0;
    
    document.querySelectorAll('.leg-card').forEach(card => {
        const days = parseInt(card.querySelector('.leg-days').value);
        if(days > maxDays) maxDays = days;
        
        legs.push({
            action: card.querySelector('.leg-action').value,
            type: card.querySelector('.leg-type').value,
            quantity: parseInt(card.querySelector('.leg-qty').value),
            strike: parseFloat(card.querySelector('.leg-strike').value),
            premium: parseFloat(card.querySelector('.leg-premium').value),
            days_to_expiration: days,
            iv: parseFloat(card.querySelector('.leg-iv').value)
        });
    });

    if(maxDays === 0) maxDays = 30;

    // 2. Generate Axis Data
    const prices = [];
    const rangePercent = 0.20; // 20% range up and down
    const center = currentPrice;
    const step = (center * (rangePercent * 2)) / 20; 
    const startPrice = center * (1 - rangePercent);
    
    for(let i=0; i<=20; i++) prices.push(startPrice + (i*step));

    const daySteps = [];
    const dateStep = maxDays / 10; // 10 data points for dates
    for(let i=0; i<=10; i++) daySteps.push(Math.round(i * dateStep));

    // 3. Build Matrix
    const matrix = []; // Z-axis

    // Loop through Prices (Y-axis)
    for(let p of prices) {
        let row = [];
        // Loop through Days (X-axis)
        for(let d of daySteps) {
            let t_remaining = (maxDays - d) / 365.0;
            if (t_remaining < 0.0001) t_remaining = 0.0001; 

            let totalProfit = 0;

            for(let leg of legs) {
                let val = 0;
                if (leg.type === 'stock') {
                    val = p;
                } else {
                    val = blackScholes(p, leg.strike, t_remaining, 0.05, leg.iv, leg.type);
                }

                if (leg.action === 'buy') {
                    totalProfit += (val - leg.premium) * 100 * leg.quantity;
                } else {
                    totalProfit += (leg.premium - val) * 100 * leg.quantity;
                }
            }
            row.push(totalProfit);
        }
        matrix.push(row);
    }

    renderGraph(daySteps, prices, matrix);
}

function renderGraph(days, prices, matrix) {
    var trace = {
        z: matrix,
        x: days.map(d => "Day " + d),
        y: prices.map(p => "$" + p.toFixed(2)),
        type: 'heatmap',
        colorscale: 'RdYlGn',
        zmid: 0,
        hoverongaps: false,
        hovertemplate: 'Day: %{x}<br>Price: %{y}<br><b>P/L: $%{z:.2f}</b><extra></extra>'
    };

    var layout = {
        title: {
            text: 'Profit / Loss Matrix',
            font: { color: '#fff' }
        },
        paper_bgcolor: '#1e1e1e',
        plot_bgcolor: '#1e1e1e',
        xaxis: { 
            title: 'Days Passed', 
            color: '#fff', 
            gridcolor: '#444' 
        },
        yaxis: { 
            title: 'Stock Price', 
            color: '#fff', 
            gridcolor: '#444' 
        },
        margin: { t: 50, b: 50, l: 60, r: 20 }
    };

    Plotly.newPlot('heatmap', [trace], layout);
}

// Initial Load
loadStrategy();
