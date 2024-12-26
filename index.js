const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fs = require('fs').promises;
const path = require('path');
const config = require('./config');

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
let connectionOption;
const MAX_PING_ERRORS = 3;
const pingInterval = 120000;
const restartDelay = 240000;
const processRestartDelay = 150000;
const retryDelay = 150000;
const hardwareInfoFile = path.join(__dirname, 'hardwareInfo.json');

async function loadFetch() {
    const fetch = await import('node-fetch').then(module => module.default);
    return fetch;
}

function getFormattedTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `[${hours}:${minutes}:${seconds}]`;
}

async function promptConnectionOption() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        // ANSI escape code for red text: \x1b[31m
        // ANSI escape code to reset color: \x1b[0m
        const redText = '\x1b[31m3. 虚假IP（不要使用）\x1b[0m';
        rl.question(`连接选项:\n1. 使用代理\n2. 不使用代理\n${redText}\n请选择一个选项 (1/2/3): `, answer => {
            rl.close();
            resolve(parseInt(answer, 10));
        });
    });
}

function generateFakeIpAddress() {
    return `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

const commonHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.5"
};

async function fetchIpAddress(fetch, agent = null) {
    const primaryUrl = "https://ip-check.bless.network/";
    const fallbackUrl = "https://api.ipify.org?format=json";

    try {
        const response = await fetch(primaryUrl, { agent, headers: commonHeaders });
        const data = await response.json();
        console.log(`[${getFormattedTime()}] 从主URL获取IP响应:`, data);
        return data.ip;
    } catch (error) {
        console.error(`[${getFormattedTime()}] 从主URL获取IP失败，错误信息: ${error.message}`);
    }

    try {
        const response = await fetch(fallbackUrl, { agent, headers: commonHeaders });
        const data = await response.json();
        console.log(`[${getFormattedTime()}] 从备用URL获取IP响应:`, data);
        return data.ip;
    } catch (fallbackError) {
        console.error(`[${getFormattedTime()}] 从备用URL获取IP失败，错误信息: ${fallbackError.message}`);
    }

    console.log(`[${getFormattedTime()}] 重试，不带头信息...`);

    try {
        const response = await fetch(primaryUrl, { agent });
        const data = await response.json();
        console.log(`[${getFormattedTime()}] 从主URL获取IP响应（不带头信息）:`, data);
        return data.ip;
    } catch (error) {
        console.error(`[${getFormattedTime()}] 从主URL获取IP失败（不带头信息），错误信息: ${error.message}`);
    }

    try {
        const response = await fetch(fallbackUrl, { agent });
        const data = await response.json();
        console.log(`[${getFormattedTime()}] 从备用URL获取IP响应（不带头信息）:`, data);
        return data.ip;
    } catch (fallbackError) {
        console.error(`[${getFormattedTime()}] 从备用URL获取IP失败（不带头信息），错误信息: ${fallbackError.message}`);
        return null;
    }
}

function generateRandomHardwareInfo() {
    const cpuModels = [
        "AMD Ryzen 9 5900HS", "Intel Core i7-10700K", "AMD Ryzen 5 3600",
        "Intel Core i9-10900K", "AMD Ryzen 7 3700X", "Intel Core i5-10600K",
        "AMD Ryzen 3 3300X", "Intel Core i3-10100", "AMD Ryzen 7 5800X",
        "Intel Core i5-11600K", "AMD Ryzen 5 5600X", "Intel Core i3-10320",
        "AMD Ryzen 3 3100", "Intel Core i9-9900K", "AMD Ryzen 9 3900X",
        "Intel Core i7-9700K", "AMD Ryzen 7 2700X", "Intel Core i5-9600K",
        "AMD Ryzen 5 2600", "Intel Core i3-9100", "AMD Ryzen 3 2200G",
        "Intel Core i9-11900K", "AMD Ryzen 9 5950X", "Intel Core i7-11700K",
        "AMD Ryzen 5 4500U", "Intel Core i7-10750H", "AMD Ryzen 7 4800H",
        "Intel Core i5-10210U", "AMD Ryzen 3 4300U", "Intel Core i3-1005G1",
        "AMD Ryzen 9 4900HS", "Intel Core i9-10850K", "AMD Ryzen 9 3950X",
        "Intel Core i7-10700", "AMD Ryzen 7 3700U", "Intel Core i5-10400",
        "AMD Ryzen 5 3550H", "Intel Core i3-10100F", "AMD Ryzen 3 3200G",
        "Intel Core i9-9900KS", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-9750H", "AMD Ryzen 5 4600H",
        "Intel Core i9-10940X", "AMD Ryzen 7 2700", "Intel Core i5-9400F",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400",
        "AMD Ryzen 3 1200", "Intel Core i3-8100", "AMD Ryzen 9 5900X",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i7-10710U", "AMD Ryzen 7 2700E",
        "Intel Core i5-9500", "AMD Ryzen 5 3400G", "Intel Core i3-8300",
        "AMD Ryzen 3 1300X", "Intel Core i9-10980HK", "AMD Ryzen 5 3600X",
        "Intel Core i7-10700F", "AMD Ryzen 7 2700", "Intel Core i5-9400"
    ];
    const cpuFeatures = ["mmx", "sse", "sse2", "sse3", "ssse3", "sse4_1", "sse4_2", "avx"];
    return {
        cpuArchitecture: "x86_64",
        cpuModel: cpuModels[Math.floor(Math.random() * cpuModels.length)],
        cpuFeatures: cpuFeatures.slice(0, Math.floor(Math.random() * cpuFeatures.length) + 1),
        numOfProcessors: Math.floor(Math.random() * 8) + 4,
        totalMemory: Math.floor(Math.random() * (128 - 8 + 1) + 8) * 1024 * 1024 * 1024
    };
}

async function loadHardwareInfo() {
    try {
        const data = await fs.readFile(hardwareInfoFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

async function saveHardwareInfo(hardwareInfo) {
    await fs.writeFile(hardwareInfoFile, JSON.stringify(hardwareInfo, null, 2));
}

async function registerNode(nodeId, hardwareId, ipAddress, agent, authToken) {
    const fetch = await loadFetch();
    const registerUrl = `${apiBaseUrl}/nodes/${nodeId}`;
    console.log(`[${getFormattedTime()}] 正在注册节点，IP: ${ipAddress}, 硬件ID: ${hardwareId}`);

    let hardwareInfo = await loadHardwareInfo();
    if (!hardwareInfo[nodeId]) {
        hardwareInfo[nodeId] = generateRandomHardwareInfo();
        await saveHardwareInfo(hardwareInfo);
    }

    const response = await fetch(registerUrl, {
        method: "POST",
        headers: {
            ...commonHeaders,
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
            ipAddress,
            hardwareId,
            hardwareInfo: hardwareInfo[nodeId],
            extensionVersion: "0.1.7"
        }),
        agent
    });

    try {
        const data = await response.json();
        console.log(`[${getFormattedTime()}] 注册响应:`, data);
        return data;
    } catch (error) {
        const text = await response.text();
        console.error(`[${getFormattedTime()}] 无法解析JSON，响应文本:`, text);
        throw new Error(`无效的JSON响应: ${text}`);
    }
}

async function startSession(nodeId, agent, authToken) {
    const fetch = await loadFetch();
    const startSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/start-session`;
    console.log(`[${getFormattedTime()}] 正在为节点 ${nodeId} 启动会话，这可能需要一些时间...`);
    const response = await fetch(startSessionUrl, {
        method: "POST",
        headers: {
            ...commonHeaders,
            Authorization: `Bearer ${authToken}`
        },
        agent
    });

    try {
        const data = await response.json();
        console.log(`[${getFormattedTime()}] 启动会话响应:`, data);
        return data;
    } catch (error) {
        const text = await response.text();
        console.error(`[${getFormattedTime()}] 无法解析JSON，响应文本:`, text);
        throw new Error(`无效的JSON响应: ${text}`);
    }
}

async function checkNodeStatus(nodeId, fetch, agent = null) {
    const nodeStatusUrl = `${apiBaseUrl}/nodes/${nodeId}`;
    try {
        const response = await fetch(nodeStatusUrl, { agent, headers: commonHeaders });
        if (response.ok) {
            console.log(`[${getFormattedTime()}] 节点 ${nodeId} 状态: 正常`);
        } else {
            // console.error(`[${getFormattedTime()}] 节点 ${nodeId} 状态检查失败，状态: ${response.status}`);
        }
    } catch (error) {
        // console.error(`[${getFormattedTime()}] 检查节点状态时发生错误，节点 ${nodeId}: ${error.message}`);
    }
}

async function checkServiceHealth(fetch, agent = null) {
    const healthUrl = "https://gateway-run.bls.dev/health";
    try {
        const response = await fetch(healthUrl, { agent, headers: commonHeaders });
        const data = await response.json();
        if (data.status === "ok") {
            console.log(`[${getFormattedTime()}] 服务健康检查: 正常`);
        } else {
            console.error(`[${getFormattedTime()}] 服务健康检查失败:`, data);
        }
    } catch (error) {
        console.error(`[${getFormattedTime()}] 服务健康检查时发生错误: ${error.message}`);
    }
}

async function pingNode(nodeId, agent, ipAddress, authToken, pingErrorCount) {
    const fetch = await loadFetch();
    const chalk = await import('chalk');
    const pingUrl = `${apiBaseUrl}/nodes/${nodeId}/ping`;

    await checkServiceHealth(fetch, agent);

    let proxyInfo;
    if (connectionOption === 3) {
        proxyInfo = '虚假IP';
    } else {
        proxyInfo = agent ? JSON.stringify(agent.proxy) : '无代理';
    }

    console.log(`[${getFormattedTime()}] 正在为节点 ${nodeId} 发送ping请求，代理: ${proxyInfo}`);
    const response = await fetch(pingUrl, {
        method: "POST",
        headers: {
            ...commonHeaders,
            Authorization: `Bearer ${authToken}`
        },
        agent
    });

    try {
        const data = await response.json();
        if (!data.status) {
            console.log(
                `[${getFormattedTime()}] ${chalk.default.green('第一次ping请求')}, 节点ID: ${chalk.default.cyan(nodeId)}, 代理: ${chalk.default.yellow(proxyInfo)}, IP: ${chalk.default.yellow(ipAddress)}`
            );
        } else {
            let statusColor = data.status.toLowerCase() === 'ok' ? chalk.default.green : chalk.default.red;
            const logMessage = `[${getFormattedTime()}] Ping响应状态: ${statusColor(data.status.toUpperCase())}, 节点ID: ${chalk.default.cyan(nodeId)}, 代理: ${chalk.default.yellow(proxyInfo)}, IP: ${chalk.default.yellow(ipAddress)}`;
            console.log(logMessage);
        }
        pingErrorCount[nodeId] = 0;

        await checkNodeStatus(nodeId, fetch, agent);

        return data;
    } catch (error) {
        const text = await response.text();
        console.error(`[${getFormattedTime()}] 无法解析JSON，响应文本:`, text);
        pingErrorCount[node.nodeId] = (pingErrorCount[node.nodeId] || 0) + 1;
        throw new Error(`无效的JSON响应: ${text}`);
    }
}

async function displayHeader() {
    const chalk = await import('chalk');
    console.log("");
    console.log(chalk.default.yellow(" ============================================"));
    console.log(chalk.default.yellow("|        Blockless Bless Network Bot         |"));
    console.log(chalk.default.yellow(" ============================================"));
    console.log("");
}

const activeNodes = new Set();
const nodeIntervals = new Map();

async function processNode(node, agent, ipAddress, authToken) {
    const pingErrorCount = {};
    let intervalId = null;

    while (true) {
        try {
            if (activeNodes.has(node.nodeId)) {
                console.log(`[${getFormattedTime()}] 节点 ${node.nodeId} 已经在处理中了。`);
                return;
            }

            activeNodes.add(node.nodeId);
            console.log(`[${getFormattedTime()}] 正在处理节点ID: ${node.nodeId}, 硬件ID: ${node.hardwareId}, IP: ${ipAddress}`);

            const registrationResponse = await registerNode(node.nodeId, node.hardwareId, ipAddress, agent, authToken);
            console.log(`[${getFormattedTime()}] 节点注册完成，节点ID: ${node.nodeId}. 响应:`, registrationResponse);

            const startSessionResponse = await startSession(node.nodeId, agent, authToken);
            console.log(`[${getFormattedTime()}] 会话启动完成，节点ID: ${node.nodeId}. 响应:`, startSessionResponse);

            console.log(`[${getFormattedTime()}] 正在为节点ID: ${node.nodeId} 发送初始ping请求`);
            await pingNode(node.nodeId, agent, ipAddress, authToken, pingErrorCount);

            if (!nodeIntervals.has(node.nodeId)) {
                intervalId = setInterval(async () => {
                    try {
                        console.log(`[${getFormattedTime()}] 正在为节点ID: ${node.nodeId} 发送ping请求`);
                        await pingNode(node.nodeId, agent, ipAddress, authToken, pingErrorCount);
                    } catch (error) {
                        console.error(`[${getFormattedTime()}] ping请求发生错误: ${error.message}`);

                        pingErrorCount[node.nodeId] = (pingErrorCount[node.nodeId] || 0) + 1;
                        if (pingErrorCount[node.nodeId] >= MAX_PING_ERRORS) {
                            clearInterval(nodeIntervals.get(node.nodeId));
                            nodeIntervals.delete(node.nodeId);
                            activeNodes.delete(node.nodeId);
                            console.error(`[${getFormattedTime()}] 节点ID: ${node.nodeId} 连续ping失败${MAX_PING_ERRORS}次，将重新启动进程...`);
                            await new Promise(resolve => setTimeout(resolve, processRestartDelay));
                            await processNode(node, agent, ipAddress, authToken);
                        }
                    }
                }, pingInterval);
                nodeIntervals.set(node.nodeId, intervalId);
            }

            break;

        } catch (error) {
            if (error.message.includes('proxy') || error.message.includes('connect') || error.message.includes('authenticate')) {
                console.error(`[${getFormattedTime()}] 节点ID: ${node.nodeId} 的代理错误，15分钟后重试: ${error.message}`);
                setTimeout(() => processNode(node, agent, ipAddress, authToken), retryDelay);
            } else {
                console.error(`[${getFormattedTime()}] 节点ID: ${node.nodeId} 发生错误，50秒后重新启动进程: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, restartDelay));
            }
        } finally {
            activeNodes.delete(node.nodeId);
        }
    }
}

async function runAll(initialRun = true) {
    try {
        if (initialRun) {
            await displayHeader();
            connectionOption = await promptConnectionOption();
        }

        const fetch = await loadFetch();
        let hardwareInfo = await loadHardwareInfo();

        config.forEach(user => {
            user.nodes.forEach(node => {
                if (!hardwareInfo[node.nodeId]) {
                    hardwareInfo[node.nodeId] = generateRandomHardwareInfo();
                }
            });
        });

        await saveHardwareInfo(hardwareInfo);

        const nodePromises = config.flatMap(user =>
            user.nodes.map(async node => {
                let agent = null;
                let ipAddress = null;

                if (connectionOption === 1 && node.proxy) {
                    if (node.proxy.startsWith('socks')) {
                        agent = new SocksProxyAgent(node.proxy);
                    } else {
                        const proxyUrl = node.proxy.startsWith('http') ? node.proxy : `http://${node.proxy}`;
                        agent = new HttpsProxyAgent(proxyUrl);
                    }
                    ipAddress = await fetchIpAddress(fetch, agent);
                } else if (connectionOption === 3) {
                    ipAddress = generateFakeIpAddress();
                } else {
                    ipAddress = await fetchIpAddress(fetch);
                }

                if (ipAddress) {
                    await processNode(node, agent, ipAddress, user.usertoken).catch(error => {
                        console.error(`[${getFormattedTime()}] 处理节点 ${node.nodeId} 时发生错误: ${error.message}`);
                    });
                } else {
                    console.error(`[${getFormattedTime()}] 因为获取IP失败，跳过节点 ${node.nodeId}。15分钟后重试.`);
                    setTimeout(async () => {
                        ipAddress = await fetchIpAddress(fetch, agent);
                        if (ipAddress) {
                            await processNode(node, agent, ipAddress, user.usertoken);
                        } else {
                            console.error(`[${getFormattedTime()}] 再次尝试获取节点 ${node.nodeId} 的IP失败。`);
                        }
                    }, retryDelay);
                }
            })
        );

        await Promise.allSettled(nodePromises);
    } catch (error) {
        const chalk = await import('chalk');
        console.error(chalk.default.yellow(`[${getFormattedTime()}] 发生错误: ${error.message}`));
    }
}

process.on('uncaughtException', (error) => {
    console.error(`[${getFormattedTime()}] 未捕获的异常: ${error.message}`);
    runAll(false);
});

runAll();
