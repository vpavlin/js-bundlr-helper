import Bundlr from "@bundlr-network/client";
import { config } from "dotenv";
import { ethers } from "ethers";
import yargs from "yargs";
import {hideBin} from "yargs/helpers"
import { statSync, readFileSync } from "fs";
import crypto from "crypto";
import { writeFileSync } from "fs";

const BASE_METADATA_FILE = "base.json"
const UPLOADED_LIST = "uploaded.json"

config();

const bundlr = new Bundlr.default(process.env.BUNDLR_URL, process.env.CURRENCY, process.env.PRIVATE_KEY)

const wallet = new ethers.Wallet(process.env.PRIVATE_KEY)

const argv = yargs(hideBin(process.argv))
    .usage('$0 <cmd> [args]')
    .command('balance', "get Bundlr balance", async function (argv) {
        const balance = await bundlr.getBalance(wallet.address)

        const convertedBalance = bundlr.utils.unitConverter(balance)
        console.log(`node balance (converted) = ${convertedBalance}`);
    })
    .command('fund', "fund Bundlr account", (yargs) => {
        yargs.option('amount', {alias: 'a', type: 'string'})
    }, async function (argv) {
        const funding = ethers.parseEther(argv.amount)
        console.log(`funding = ${funding} (${argv.amount})`);
    
        const resp = await bundlr.fund(funding)
        console.log(`Funding successful txID=${resp.id} amount funded=${resp.quantity}`);
    })
    .command('upload', "upload image and metadata", (yargs) => {
        yargs
            .option('image', {alias: 'i', type: 'string'})
            .option('attr', {alias: 'a', type:'array'})
            .option('name', {alias: 'n', type:'string'})
            .option('id', {type: 'string'})
    },async function(argv) {
        if (!argv.image) {
            console.log("No image provided")
            return
        }

        if (!argv.id) {
            console.log("No id provided")
            return
        }
        const { size } = statSync(argv.image);
        const price = await bundlr.getPrice(size);
        console.log(price)
        const convertedBalance = bundlr.utils.unitConverter(price)
        console.log(`upload cost = ${convertedBalance}`);

        let hash = getUploaded(argv.image)
        if (!hash) {
            console.log(`Uploading ${argv.image}`)
            hash = await uploadFile(argv.image)
        }

        const base_metadata_content = readFileSync(BASE_METADATA_FILE)
        const base_metadata = JSON.parse(base_metadata_content)

        if (base_metadata.description && base_metadata.description.startsWith("file://")) {
            const description = readFileSync(base_metadata.description.replace(/^file:\/\//, ''), 'utf8')
            base_metadata.description = description
        }

        if (argv.name) {
            base_metadata.name= argv.name
        }

        base_metadata.image = `https://arweave.net/${hash}`

        if (!base_metadata.attributes) {
            base_metadata.attributes = []
        }

        for (let a of argv.attr) {
            console.log(a)

            const attr = a.split("=")
            if (attr[0].length == 0 || attr[1].length == 0) {
                console.log(`Attribute ${a} has incorrect format`)
                return 
            }
            base_metadata.attributes.push({trait_type: attr[0], value: attr[1]})
        }

        console.log(base_metadata)
        const metadata_hash = await uploadContent(base_metadata, `output/${argv.id}.json`)
        console.log(`Metadata uploaded => https://arweave.net/${metadata_hash}`)
    })
    .parse()


const hashFile = (file) => {
    const hash = crypto.createHash("sha1")
    const content = readFileSync(file, 'utf8')
    const data = hash.update(content, 'utf-8')
    return data.digest('hex')
}

const getUploaded = (file) => {
    const hash = hashFile(file)
    const uploaded_list_file = readFileSync(UPLOADED_LIST)
    const uploaded_list = JSON.parse(uploaded_list_file)

    const ar_hash = uploaded_list[hash]
    
    if (ar_hash) return ar_hash.hash
    
    return undefined
}

const setUploaded = (file, ar_hash) => {
    const hash = hashFile(file)
    const uploaded_list_file = readFileSync(UPLOADED_LIST)
    const uploaded_list = JSON.parse(uploaded_list_file)

    uploaded_list[hash] = {hash: ar_hash, file: file}

    const new_content = JSON.stringify(uploaded_list)
    writeFileSync(UPLOADED_LIST, new_content)
}

const uploadFile = async (file) => {
    const hash = getUploaded(file)
    if (hash) {
        return hash
    }

    const { id } = await bundlr.uploadFile(file);
    console.log(`${file} --> Uploaded to https://arweave.net/${id}`);

    setUploaded(file, id)

    return id
}

const uploadContent = async (content, filename) => {
    const new_content = JSON.stringify(content)
    writeFileSync(filename, new_content)

    const hash = await uploadFile(filename)

    return hash
}