import { SubstrateExtrinsic } from "@subql/types";
import { Extrinsic } from "@polkadot/types/interfaces";
import { AnyTuple } from "@polkadot/types/types";
import { RemarkEntity } from "../types";
import { Option, Some, None, isNone } from "../lib";
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex } from '@polkadot/util';

const SECTION_SYSTEM = "system";
const METHOD_REMARK = "remark";
const ERROR_ADDRESS = '';

interface RemarkData {
    action: string,
    timestamp: string,
    msg: string
}

function isRemark(ext: Extrinsic): Boolean {
    const { method: { method, section } } = ext
    return section === SECTION_SYSTEM && method === METHOD_REMARK
}


/**
 * 
 * @param args 
 * @returns 
 * {
 *  "action":"Replace address",
 *  "timestamp":"2021-01-14",
 *  "msg":"I confirm I want to receive project rewards 
 *  to: ADDRESS. I agree and acknowledge that Parallel Finance shall not be liable for any direct/ indirect losses of any kind."}
 */
function parseRemarkBody(args: AnyTuple): Option<string> {
    const data = Buffer.from(args.toString().slice(2), 'hex').toString('utf8')
    logger.info("get remark extrinsic origin data: %o", data)
    if (data.startsWith("{")) {
        // NOTE: if remark policy change, need to modify this
        try {
            const jDat = JSON.parse(data) as RemarkData
            const { action, timestamp, msg } = jDat
            if (!action || !timestamp || !msg) return None
            logger.info("parsed remark json data: %o", jDat)
            return Some(msg.split("to:")[1].split(".")[0])
        } catch (e) {
            logger.error("parse remark data error: %o", e)
            return None
        }
    }
    return None
}

export async function handleRemarkExtrinsic(ext: SubstrateExtrinsic): Promise<void> {
    const { isSigned, method: { args } } = ext.extrinsic
    if (!isRemark(ext.extrinsic) || !isSigned || args.length < 1) {
        return
    }
    const re = parseRemarkBody(args)
    if (isNone(re)) {
        return
    }
    const ex = ext.extrinsic
    const oriAddress = ex.signer.toString()
    const dstAddress = filterValidAddress(oriAddress, re.value)
    if (dstAddress === ERROR_ADDRESS) {
        logger.warn(`Invalid address: ${re.value}`)
        return
    }

    if ((await RemarkEntity.getByOriAddress(oriAddress)).length === 0) {
        try{
            const remarkEntity = RemarkEntity.create({
                id: ex.hash.toString(),
                oriAddress,
                dstAddress,
                blockHeight: ext.block.block.header.number.toNumber(),
                createAt: ext.block.timestamp
            })
            await remarkEntity.save()
        } catch (e) {
            logger.error("create remark entity error: %o", e)
        }
    } else {
        checkLatestDstAddress(oriAddress, dstAddress)
    }
}

async function checkLatestDstAddress(oriAddress: string, dstAddress: string): Promise<void> {
    let records = await RemarkEntity.getByOriAddress(oriAddress)
    if (!records || records.length > 1) {
        logger.error(`filter dirty data error: too many records ${records.length}`)
    }

    try{
        let record = records[0]
        record.dstAddress = dstAddress
        await record.save()
    } catch (e) {
        logger.error("update remark entiry address error: %o", e)
    }
}

function filterValidAddress(oriAddress: string, dstAddress: string): string {
    const isValidAddress = (address: string) => {
        try {
            encodeAddress(
              isHex(address)
                ? hexToU8a(address)
                : decodeAddress(address)
            );

            return true;
          } catch (error) {
            return false;
          }
    }

    const longestWord = dstAddress.split(' ')
        .reduce(
            function(longest, currentWord) {
                return currentWord.length > longest.length ? currentWord : longest;
            },
            "",
        );
    return (isValidAddress(longestWord) && (longestWord !== oriAddress)) ? longestWord : ERROR_ADDRESS
}
