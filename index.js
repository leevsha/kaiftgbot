const TelegramApi = require('node-telegram-bot-api');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
require('dotenv').config();

const token = process.env.TGTOKEN;
const spreadsheetId = process.env.spreadsheetTOKEN;
const googleCredentials = JSON.parse(process.env.googleCREDENTIALS);

const bot = new TelegramApi(token, { polling: true });

const btns = {
    reply_markup: JSON.stringify({
        inline_keyboard: [
            [{ text: 'Да', callback_data: 'Yes' }, { text: 'Нет', callback_data: 'No' }]
        ]
    })
}

let name = {};
let eventsArr;
let dateSheets;
let place;


const start = () => {
    bot.setMyCommands([{ command: '/check_in', description: 'Записаться в гест лист' }])
    bot.on('message', async msg => {
        let text = msg.text;
        let chatId = msg.chat.id;
        if (text === '/check_in') {
            await bot.sendMessage(chatId, 'Добро пожаловать в KAЇF Bot. Здесь ты можешь записать себя и своих друзей в гест лист. Выбери пожалуйста дату, на которую ты хотел(-а) бы записать себя и своих друзей');
            const dateBtns = await readEvents();
            return bot.sendMessage(chatId, `На какое число ты хочешь записаться?`, dateBtns);
        }
        if (text === '/start') {
            return bot.sendMessage(chatId, 'Привет. Напиши пожалуйста команду /check_in, чтобы записаться в гест лист');
        }
    })

    bot.on('callback_query', async msg => {
        let data = msg.data;
        let chatId = msg.message.chat.id
        if (data === 'Yes') {
            sheetsAutomate(name[chatId]);
            delete name[chatId];
            await bot.deleteMessage(chatId, msg.message.message_id);
            return bot.sendMessage(chatId, 'Спасибо, что воспользовались ботом для записи в гест лист! Ждем тебя(вас) ' + dateSheets + ' в ' + place + '\n' + '\n' + 'Так же не забывай заходить в наш <a href="https://t.me/+SM1ykEKtE6RkYTcy">чатик</a>', { parse_mode: 'HTML' })
        } else if (data === 'No') {
            await bot.deleteMessage(chatId, msg.message.message_id);
            await bot.sendMessage(chatId, 'Повторно напиши фамилию(и) и имя(имена)');
            await ask(chatId);
        } else {
            eventsArr.forEach(async element => {
                if (data === element[0]) {
                    place = element[1];
                    dateSheets = data;
                    await bot.deleteMessage(chatId, msg.message.message_id);
                    await bot.sendMessage(chatId, `Ты выбрал(-а) ${data}`);
                    await bot.sendMessage(chatId, `Теперь отправь мне своё фамилию и имя в порядке ФАМИЛИЯ ИМЯ. Если ты записываешь несколько людей - напиши их фамилию и имя через запятую.`);
                    await bot.sendMessage(chatId, `Пример:
Ивавов Иван, Васильев Вася, Настюхина Настя`);
                    await ask(chatId);
                }
            });
        }
    })
}

async function ask(chatId) {
    bot.once('message', async message => {
        if (chatId === message.chat.id) {
            let checkInTxt = message.text;
            name[message.from.id] = checkInTxt;
            await bot.sendMessage(chatId, `Ты хочешь записать в гест лист ${name[message.from.id]}?`, btns);
        } else {
            await ask(chatId)
        }
    })
}

async function sheetsAutomate(name) {
    const auth = new GoogleAuth({
        credentials: googleCredentials,
        scopes: SCOPES
    });
    const client = await auth.getClient();
    const sheets = await google.sheets({ version: 'v4', auth: client });
    await sheets.spreadsheets.values.append({
        auth,
        spreadsheetId,
        range: `${dateSheets}!A:A`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: name && name.split(', ').map(el => [el])
        }
    })
}

async function readEvents() {
    const auth = new GoogleAuth({
        credentials: googleCredentials,
        scopes: SCOPES
    });
    const client = await auth.getClient();
    const sheets = await google.sheets({ version: 'v4', auth: client });
    let event = await sheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Events'
    })

    eventsArr = event.data.values;
    const dateBtns = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                eventsArr.map(el => ({ text: el[0], callback_data: el[0] }))
            ]
        })
    }
    return dateBtns;
}

start();

