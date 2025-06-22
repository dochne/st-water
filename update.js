import puppeteer from 'puppeteer';

import sqlite3 from 'sqlite3'
import { open } from 'sqlite';
import fs from 'fs/promises'

(async () => {
    console.log("huh");
    const db = await open({
        filename: './database.db',
        driver: sqlite3.Database
    })

    // Run migrations!
    console.log("Running migrations");
    await db.run(`CREATE TABLE IF NOT EXISTS "migrations" ("filename" varchar,"created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`)
    const allMigrations = await fs.readdir('./migrations');
    const runMigrations = [...(await db.all("SELECT filename FROM migrations"))].map((row) => row.filename);

    console.log("All", allMigrations, "run", runMigrations);
    for (const filename of allMigrations.filter((filename) => !runMigrations.includes(filename))) {
        console.log(runMigrations, "filename", filename);
        const migrationSql = (await fs.readFile('./migrations/' + filename)).toString();
        await db.exec(`BEGIN; ${migrationSql}; INSERT INTO migrations (filename) VALUES ('${filename}'); COMMIT;`)
    }

    const browser = await puppeteer.launch();

    await (async () => {
        const page = await browser.newPage();
        console.log("Loading Reservoir levels main page");

        await page.goto('https://www.stwater.co.uk/about-us/reservoir-levels/');
    
        const urls = await page.evaluate(() => {
            return [...document.getElementsByClassName("water-level-tile")].map(
                (element) => element.getElementsByTagName("a")[0].href
            );
        })

        console.log("Updating days that data is present for");
        urls.forEach(async (url) => {
            let [date] = url.match(new RegExp("[0-9]+-[^/]*"));
            let [day, month, year] = date.split("-");

            switch (date) {
                case '30-december-20190': 
                    year = 2019;
                    break;

                case '14-september-20201':
                    year = 2020;
                    break;
            }

            let parsedDate = new Date(Date.parse([day, month, year].join(" "))).toISOString()

            const result = await db.run(
                'INSERT INTO date (date, url) VALUES (?, ?) ON CONFLICT (url) DO NOTHING',
                parsedDate,
                url
            )
        });

        console.log("Closing page");
        page.close();
    })();
    
    console.log("Processing days without data");
    const daysToProcess =  await db.all('SELECT * FROM date WHERE processed=0 ORDER BY date ASC');
    console.log(`Found ${daysToProcess.length} days to process`);

    for (let index=0; index<daysToProcess.length; index++) {
        const result = daysToProcess[index];
        console.log(`Loading page for ${result.date} [${index + 1}/${daysToProcess.length}]`);
        const page = await browser.newPage();
        // console.log("hi", result, index);
        await page.goto(result.url);

        const storage = await page.evaluate(() => {
            let trs = document.querySelector(".water-level-detail-table tbody").children;
            let values = [];
            for (let x=2; x<trs.length; x++) {
                let tr = trs[x];
                if (tr.children.length < 5) {
                    continue;
                }
                values.push({
                    reservoir: (tr.children[0].innerText + tr.children[1].innerText).trim(),
                    max_storage: tr.children[2].innerText,
                    current: tr.children[4].innerText,
                })
            }
            return values;
        })

        storage.forEach(async (value) => {
            await db.run(
                'INSERT INTO water_level (reservoir, max_storage, current_storage, date_id) VALUES (?, ?, ?, ?)',
                value.reservoir,
                value.max_storage,
                value.current,
                result.id
            )
        });

        await db.run('UPDATE date SET processed=1 WHERE id=?', result.id)
        await page.close();
    }

    await browser.close();

    // Gross, but who cares
    await db.run(`UPDATE water_level SET reservoir=replace(reservoir, "Including", "") WHERE reservoir LIKE "%including"`)
})();
