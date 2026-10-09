/* Workfolio - tiny ZIP writer ("stored", no compression).
 * Office files (.docx, .xlsx) are ZIP archives of XML, so this is all the
 * exporters need. Workfolio.zip([{ name, data: string | Uint8Array }], mime) -> Blob
 */
(function (W) {
    "use strict";

    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(bytes) {
        let c = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    }

    const u16 = (v) => [v & 255, (v >> 8) & 255];
    const u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];

    W.zip = function zip(files, mime) {
        const enc = new TextEncoder();
        const parts = [];
        const central = [];
        let offset = 0;
        files.forEach((f) => {
            const name = enc.encode(f.name);
            const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
            const crc = crc32(data);
            // bit 11 = UTF-8 names; date 0x21 = 1980-01-01 (keeps output deterministic)
            const common = [...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
            parts.push(new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...common]), name, data);
            central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
            offset += 30 + name.length + data.length;
        });
        const cdSize = central.reduce((n, c) => n + c.length, 0);
        const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
        return new Blob([...parts, ...central, end], { type: mime });
    };
})(window.Workfolio);
