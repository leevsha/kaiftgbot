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
            [{ text: 'Так', callback_data: 'Yes' }, { text: 'Ні', callback_data: 'No' }]
        ]
    })
}

let name = {};
let eventsArr;
let dateSheets;
let place;
let latitude;
let longitude;
let clubsLocations;


const start = () => {
    bot.setMyCommands([{ command: '/check_in', description: 'Записатись до списку гостей' }, { command: '/feedback', description: 'Сповістити про проблему/Запропонувати функціонал' }, { command: '/location', description: 'Подивитись місце знаходження клубів' }, { command: '/photos', description: 'Подивитись фотографії з вечірок' }])
    bot.on('message', async msg => {
        let text = msg.text;
        let chatId = msg.chat.id;
        let user = await readUser(chatId);
        if (!user) {
            await pasteUser(msg.from.username ? msg.from.username : msg.from.last_name ? msg.from.first_name + ' ' + msg.from.last_name : msg.from.first_name, chatId)
        }
        if (text === '/check_in') {
            await bot.sendMessage(chatId, 'Вітаємо у KAÏF Bot! Зараз ти можеш записати себе та своїх друзів на вечірку та отримати знижку 5€ на вхід.');
            const dateBtns = await readEvents();
            return bot.sendMessage(chatId, `Вибери будь ласка дату вечірки на яку ти хотів(-ла) б піти`, dateBtns);
        }
        if (text === '/start') {
            return bot.sendMessage(chatId, 'Привіт. Напиши будь ласка команду /check_in, щоб записатись у список гостей');
        }
        if (text === '/feedback') {
            return bot.sendMessage(chatId, 'Аби сповістити про проблему чи запропонувати функціонал пиши разробнику бота - @nikita_chernysh');
        }
        if (text === '/location') {
            const clubNamesBtns = await readAllClubsLocation();
            return bot.sendMessage(chatId, `Вибери клуб, розташування якого ти хочеш подивитись.`, clubNamesBtns);
        }
        if (text === '/photos') {
            let photosArr = await readAllPhotos();
            let message = '';
            photosArr.forEach(element => {
                message += element.reduce((prev, next) => prev + ' - ' + next + '\n');
            })
            return bot.sendMessage(chatId, message);
        }
        if (text === process.env.specialcommand) {
            let allUsers = await readAllUsers();
            allUsers.forEach(async el => await bot.sendMessage(el[0], await readNewsLetterText()));
        }
    })

    bot.on('callback_query', async msg => {
        let data = msg.data;
        let chatId = msg.message.chat.id
        if (data === 'Подій поки немає :(') {
            await bot.deleteMessage(chatId, msg.message.message_id);
            await bot.sendMessage(chatId, `Спробуй написати пізніше /check_in, скоро щось точно з‘явиться!`);
        }
        if (data === 'Yes') {
            await sheetsAutomate(name[chatId], msg.from.username ? msg.from.username : msg.from.last_name ? msg.from.first_name + ' ' + msg.from.last_name : msg.from.first_name);
            delete name[chatId];
            await bot.deleteMessage(chatId, msg.message.message_id);
            await bot.sendMessage(chatId, 'Дякую, що скористався моєю допомогою. Чекаю на тебе (вас) ' + dateSheets + ' в ' + place + '\n' + '\n' + 'Також не забувай про наш <a href="https://t.me/+SM1ykEKtE6RkYTcy">чат😎</a>', { parse_mode: 'HTML' })
            await bot.sendLocation(chatId, latitude, longitude);
        } else if (data === 'No') {
            await bot.deleteMessage(chatId, msg.message.message_id);
            await bot.sendMessage(chatId, `Напиши ще раз прізвище(а) та ім‘я(імена)`);
            await ask(chatId);
        } else {
            eventsArr && eventsArr.forEach(async element => {
                if (data === element[0]) {
                    place = element[1];
                    latitude = element[2];
                    longitude = element[3]
                    dateSheets = data;
                    await bot.deleteMessage(chatId, msg.message.message_id);
                    await bot.sendMessage(chatId, `Ти вибрав(-ла) ${data}`);
                    await bot.sendMessage(chatId, `Тепер надішлм мені своє призвіще та ім‘я у порядку {ПРИЗВІЩЕ ІМ‘Я}. Якщо ти записуєш декілька людей тоді пиши їх призвіща та імена через кому.`);
                    await bot.sendMessage(chatId, `Приклад:
Іванов Іван, Дорошенко Сергій, Козакова Настя`);
                    await ask(chatId);
                }
            });
        }
        clubsLocations && clubsLocations.forEach(async element => {
            if (data === element[0]) {
                await bot.deleteMessage(chatId, msg.message.message_id);
                await bot.sendMessage(chatId, `Ти выбрав(-ла) ${data}`);
                await bot.sendLocation(chatId, element[1], element[2]);
            }
        })
    })
}

async function ask(chatId) {
    bot.once('message', async message => {
        if ((message.text === '/start' || message.text === '/check_in' || message.text === '/feedback' || message.text === '/location' || message.text === '/photos') && message.from.id === chatId) {
            await bot.sendMessage(chatId, 'Ти написав(-ла) команду, будь ласка напиши /check_in, щоб записатись у список гостей заново');
            return;
        }
        if (chatId === message.chat.id) {
            let checkInTxt = message.text;
            name[message.from.id] = checkInTxt;
            await bot.sendMessage(chatId, `Ти хочеш записати у список гостей ${name[message.from.id]}?`, btns);
        } else {
            await ask(chatId)
        }
    })
}

async function sheetsAutomate(name, username) {
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
            values: name && name.split(', ').map(el => [el, username])
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

    eventsArr = event.data.values || ['Подій поки немає :('];
    const dateBtns = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                eventsArr[0] === 'Подій поки немає :(' ? [{ text: eventsArr[0], callback_data: eventsArr[0] }] : eventsArr.map(el => ({ text: el[0], callback_data: el[0] }))
            ]
        })
    }
    return dateBtns;
}

async function readAllClubsLocation() {
    const auth = new GoogleAuth({
        credentials: googleCredentials,
        scopes: SCOPES
    });
    const client = await auth.getClient();
    const sheets = await google.sheets({ version: 'v4', auth: client });
    let event = await sheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'All clubs'
    })

    clubsLocations = event.data.values
    const clubNamesBtns = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                clubsLocations.map(el => ({ text: el[0], callback_data: el[0] }))
            ]
        })
    }
    return clubNamesBtns;
}

async function readAllPhotos() {
    const auth = new GoogleAuth({
        credentials: googleCredentials,
        scopes: SCOPES
    });
    const client = await auth.getClient();
    const sheets = await google.sheets({ version: 'v4', auth: client });
    let event = await sheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Photos'
    })
    return event.data.values;
}

async function readUser(chatId) {
    const auth = new GoogleAuth({
        credentials: googleCredentials,
        scopes: SCOPES
    });
    const client = await auth.getClient();
    const sheets = await google.sheets({ version: 'v4', auth: client });
    let event = await sheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Users'
    })
    let chatIds = event.data.values.map(el => el[0]);
    return chatIds.find(elem => elem === chatId.toString());
}

async function pasteUser(username, chatId) {
    const auth = new GoogleAuth({
        credentials: googleCredentials,
        scopes: SCOPES
    });
    const client = await auth.getClient();
    const sheets = await google.sheets({ version: 'v4', auth: client });
    await sheets.spreadsheets.values.append({
        auth,
        spreadsheetId,
        range: `Users!A:A`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [[chatId, username]]
        }
    })
}

async function readAllUsers() {
    const auth = new GoogleAuth({
        credentials: googleCredentials,
        scopes: SCOPES
    });
    const client = await auth.getClient();
    const sheets = await google.sheets({ version: 'v4', auth: client });
    let event = await sheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Users!A:A'
    })
    return event.data.values;
}

async function readNewsLetterText() {
    const auth = new GoogleAuth({
        credentials: googleCredentials,
        scopes: SCOPES
    });
    const client = await auth.getClient();
    const sheets = await google.sheets({ version: 'v4', auth: client });
    let event = await sheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'News Letter Text!A1'
    })
    return event.data.values[0][0];
}

start();

