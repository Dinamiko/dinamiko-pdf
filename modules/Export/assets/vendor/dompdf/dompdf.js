/*!
 * dompdf.js 2.0.6 <https://github.com/lmn1919/dompdf.js>
 * Copyright (c) 2026 lfc
 * Released under MIT License
 */
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.dompdf = {}));
})(this, (function (exports) { 'use strict';

    /**
     * Binary Snapshot v1 encoder. Must match packages/dom2pdf-wasm/src/snapshot.rs.
     * All integers little-endian; floats = f32 LE.
     */
    // Shared TextEncoder to avoid per-call allocation (called hundreds of times per export).
    let sharedTextEncoder = null;
    class BinWriter {
        constructor(cap = 4096) {
            this.pos = 0;
            this.buf = new Uint8Array(cap);
            this.dv = new DataView(this.buf.buffer);
        }
        ensure(n) {
            if (this.pos + n <= this.buf.length)
                return;
            let cap = this.buf.length;
            while (cap < this.pos + n)
                cap *= 2;
            const nb = new Uint8Array(cap);
            nb.set(this.buf);
            this.buf = nb;
            this.dv = new DataView(this.buf.buffer);
        }
        u8(v) {
            this.ensure(1);
            this.buf[this.pos++] = v & 0xff;
        }
        u16(v) {
            this.ensure(2);
            this.dv.setUint16(this.pos, v, true);
            this.pos += 2;
        }
        u32(v) {
            this.ensure(4);
            this.dv.setUint32(this.pos, v >>> 0, true);
            this.pos += 4;
        }
        i32(v) {
            this.ensure(4);
            this.dv.setInt32(this.pos, v | 0, true);
            this.pos += 4;
        }
        f32(v) {
            this.ensure(4);
            this.dv.setFloat32(this.pos, v, true);
            this.pos += 4;
        }
        bytes(b) {
            this.ensure(b.length);
            this.buf.set(b, this.pos);
            this.pos += b.length;
        }
        /** UTF-8 length without allocating the encoded bytes. */
        static utf8Len(s) {
            let n = 0;
            for (let i = 0; i < s.length; i++) {
                const c = s.charCodeAt(i);
                if (c < 0x80)
                    n += 1;
                else if (c < 0x800)
                    n += 2;
                else if (c >= 0xd800 && c <= 0xdbff) {
                    n += 4;
                    i++;
                }
                else
                    n += 3;
            }
            return n;
        }
        utf8(s) {
            if (!sharedTextEncoder)
                sharedTextEncoder = new TextEncoder();
            this.bytes(sharedTextEncoder.encode(s));
        }
        result() {
            // Return a compact copy so the backing buffer can be transferred cleanly.
            const out = new Uint8Array(this.pos);
            out.set(this.buf.subarray(0, this.pos));
            return out;
        }
    }

    /**
     * Page size presets. Width/height in pt (1/72 inch).
     *
     * Values are derived from dompdf.js page_sizes.md (which lists px at 96 dpi):
     * px * 0.75 = pt. Portrait orientation; [width, height].
     */
    /** [widthPt, heightPt] for each named page size. */
    const PAGE_SIZES = {
        a0: [2384.25, 3370.5],
        a1: [1683.75, 2384.25],
        a2: [1190.25, 1683.75],
        a3: [842.25, 1190.25],
        a4: [595.5, 842.25],
        a5: [419.25, 595.5],
        a6: [297.75, 419.25],
        a7: [210, 297.75],
        a8: [147.75, 210],
        a9: [105, 147.75],
        a10: [73.5, 105],
        b0: [2835, 4008],
        b1: [2004, 2835],
        b2: [1417.5, 2004],
        b3: [1000.5, 1417.5],
        b4: [708.75, 1000.5],
        b5: [498.75, 708.75],
        b6: [354, 498.75],
        b7: [249.75, 354],
        b8: [175.5, 249.75],
        b9: [124.5, 175.5],
        b10: [87.75, 124.5],
        c0: [2599.5, 3676.5],
        c1: [1836.75, 2599.5],
        c2: [1298.25, 1836.75],
        c3: [918.75, 1298.25],
        c4: [648.75, 918.75],
        c5: [459, 648.75],
        c6: [323.25, 459],
        c7: [229.5, 323.25],
        c8: [161.25, 229.5],
        c9: [113.25, 161.25],
        c10: [79.5, 113.25],
        letter: [612, 792],
        'government-letter': [576, 756],
        legal: [612, 1008],
        'junior-legal': [360, 576],
        tabloid: [792, 1224],
        ledger: [1224, 792],
        'government-legal': [612, 936],
    };
    /** Resolve a format name (or [w,h] array) to [widthPt, heightPt]. Default a4. */
    function resolvePageSize(format) {
        if (Array.isArray(format) && format.length === 2) {
            return [format[0], format[1]];
        }
        if (typeof format === 'string') {
            const key = format.toLowerCase();
            if (PAGE_SIZES[key])
                return PAGE_SIZES[key];
        }
        return PAGE_SIZES.a4;
    }

    /**
     * Hand-written JS glue for the dependency-free WASM module (no wasm-bindgen).
     *
     * WASM 二进制已内联为 base64（见 wasm-base64.ts），运行时通过 base64 解码 +
     * WebAssembly.instantiate 加载，无需 fetch 外部 .wasm 文件。
     * 这样打包后的 JS 库是单文件，可直接通过 CDN/UMD 引入。
     */
    /** base64 string -> Uint8Array (length inferred from decoded content, or capped by `len`). */
    function base64ToBytes(b64, len) {
        if (typeof atob === 'function') {
            const bin = atob(b64);
            const n = bin.length;
            const out = new Uint8Array(n);
            for (let i = 0; i < n; i++)
                out[i] = bin.charCodeAt(i) & 0xff;
            return out;
        }
        const g = globalThis;
        const bytes = g.Buffer.from(b64, 'base64');
        return len !== undefined ? bytes.subarray(0, len) : bytes;
    }

    /**
     * DOM snapshot collector. Walks a root element, reads computed styles + rects,
     * slices text nodes into line boxes (with UTF-8 byte offsets), and converts
     * <img> elements to JPEG bytes. Emits the binary Snapshot v2 (see format.ts /
     * snapshot.rs).
     *
     * Public option shape mirrors dompdf.js (format/pagination/pageConfig/fontConfig/
     * backgroundColor/useCORS/...); advanced pt-level overrides are retained.
     */
    function debugPerfFreshSnapshotState() {
        return {
            startedAt: performance.now(),
            strategyVector: 0,
            strategyBackgroundRaster: 0,
            strategyFullRaster: 0,
            resolveBackdropColorCalls: 0,
            resolveBackdropColorMs: 0,
            resolveBackdropImageCalls: 0,
            resolveBackdropImageMs: 0,
            resolveBackdropAncestorScans: 0,
            rasterBgCalls: 0,
            rasterBgMs: 0,
            rasterBgDepth: 0,
            rasterBgMaxDepth: 0,
            rasterBgCacheHits: 0,
            rasterBgCacheMisses: 0,
            rasterFullCalls: 0,
            rasterFullMs: 0,
        };
    }
    function getDebugPerfState() {
        const key = '__dompdfDebugPerfState__';
        const g = globalThis;
        if (!g[key]) {
            g[key] = {
                snapshot: debugPerfFreshSnapshotState(),
                backdropRasterCache: new WeakMap(),
            };
        }
        return g[key];
    }
    function resetDebugPerfSnapshotState() {
        const state = getDebugPerfState();
        state.snapshot = debugPerfFreshSnapshotState();
        state.backdropRasterCache = new WeakMap();
    }
    /**
     * Default pageConfig applied when `pagination` is enabled but no `pageConfig`
     * is supplied — mirrors dompdf.js (main branch) so paginated exports get a
     * page-number footer by default. Header reserves a 50px band (empty content);
     * footer renders `${currentPage}/${totalPages}`. Only engaged in paginated
     * mode: the original library overlays HF in single-page mode without reserving
     * height, which this engine cannot replicate, so single-page stays HF-free
     * unless an explicit pageConfig is passed.
     */
    const DEFAULT_PAGE_CONFIG = {
        header: {
            content: '',
            height: 50,
            contentPosition: 'centerRight',
            contentColor: '#333333',
            contentFontSize: 16,
            padding: [0, 24, 0, 24],
        },
        footer: {
            content: '${currentPage}/${totalPages}',
            height: 50,
            contentPosition: 'center',
            contentColor: '#333333',
            contentFontSize: 16,
            padding: [0, 24, 0, 24],
        },
    };
    /** Resolve the effective static (object-form) pageConfig, honoring the library default. */
    function resolveStaticHF(options, pagination) {
        if (typeof options.pageConfig === 'object')
            return options.pageConfig;
        // Match dompdf.js: `opts.pageConfig ?? DEFAULT` — null/undefined falls back to default.
        // Gated on pagination to avoid reserving HF height in single-page mode (engine limitation).
        if (pagination && options.pageConfig == null)
            return DEFAULT_PAGE_CONFIG;
        return null;
    }
    function normalizePageNumber(value) {
        if (!Number.isFinite(value))
            return null;
        const pageNum = Math.trunc(value);
        return pageNum > 0 ? pageNum : null;
    }
    function normalizeExcludedPages(config) {
        if (!config)
            return [];
        const raw = [
            ...(Array.isArray(config.excludePage)
                ? config.excludePage
                : config.excludePage == null
                    ? []
                    : [config.excludePage]),
            ...(config.excludePages ?? []),
        ];
        const out = [];
        const seen = new Set();
        for (const value of raw) {
            const pageNum = normalizePageNumber(value);
            if (pageNum == null || seen.has(pageNum))
                continue;
            seen.add(pageNum);
            out.push(pageNum);
        }
        return out;
    }
    function configExcludesPage(config, pageNum) {
        return normalizeExcludedPages(config).includes(pageNum);
    }
    function pageConfigExcludesPage(pageConfig, pageNum) {
        return configExcludesPage(pageConfig, pageNum);
    }
    function pageConfigNeedsPerPageResolution(pageConfig) {
        return typeof pageConfig === 'function'
            || (typeof pageConfig === 'object' && pageConfig != null && normalizeExcludedPages(pageConfig).length > 0);
    }
    function watermarkNeedsPerPageResolution(watermark) {
        return typeof watermark === 'function'
            || (typeof watermark === 'object' && watermark != null && normalizeExcludedPages(watermark).length > 0);
    }
    const warnedLegacyOptions = new Set();
    function warnLegacyOption(name, detail) {
        if (warnedLegacyOptions.has(name))
            return;
        warnedLegacyOptions.add(name);
        console.warn(`dom2pdf: legacy option "${name}" ${detail}`);
    }
    function normalizeLegacyFontStyle(fontStyle) {
        return fontStyle === 'italic' || fontStyle === 'oblique' ? 'italic' : 'normal';
    }
    function normalizeLegacyFontWeight(fontWeight) {
        return (fontWeight ?? 400) > 500 ? 700 : 400;
    }
    function arrayifyFontConfig(fontConfig) {
        if (!fontConfig)
            return [];
        return Array.isArray(fontConfig) ? fontConfig : [fontConfig];
    }
    function dedupeFontConfigs(fontConfigs) {
        const out = [];
        const seen = new Set();
        for (const fontConfig of fontConfigs) {
            const key = JSON.stringify({
                charRange: fontConfig.charRange ?? null,
                family: fontConfig.fontFamily,
                iconFont: fontConfig.iconFont ?? false,
                isDefault: fontConfig.isDefault ?? false,
                style: fontConfig.fontStyle ?? 'normal',
                weight: fontConfig.fontWeight ?? 400,
            });
            if (seen.has(key))
                continue;
            seen.add(key);
            out.push(fontConfig);
        }
        return out;
    }
    function normalizeLegacyOptions(options = {}) {
        const normalized = {
            ...options,
            fontConfig: arrayifyFontConfig(options.fontConfig),
            langFontConfig: arrayifyFontConfig(options.langFontConfig),
            form: normalizeFormOptions(options.form),
        };
        if (options.allowTaint !== undefined) {
            warnLegacyOption('allowTaint', 'is accepted for API compatibility but is not used by the WASM snapshot pipeline.');
        }
        if (options.cache !== undefined) {
            warnLegacyOption('cache', 'is accepted for API compatibility but cache injection is not supported in the current pipeline.');
        }
        if (options.canvas !== undefined) {
            warnLegacyOption('canvas', 'is accepted for API compatibility but rendering does not target a caller-provided canvas.');
        }
        if (options.floatPrecision !== undefined) {
            warnLegacyOption('floatPrecision', 'is accepted for API compatibility but only `precision` is used by the current PDF encoder.');
        }
        if (options.foreignObjectRendering !== undefined) {
            warnLegacyOption('foreignObjectRendering', 'is accepted for API compatibility but the current pipeline always uses DOM snapshot + WASM rendering.');
        }
        if (options.imageTimeout !== undefined) {
            warnLegacyOption('imageTimeout', 'is accepted for API compatibility but image loading timeout is not configurable in the current pipeline.');
        }
        if (options.logging !== undefined) {
            warnLegacyOption('logging', 'is accepted for API compatibility but there is no runtime logger toggle in the current pipeline.');
        }
        if (options.onclone !== undefined) {
            warnLegacyOption('onclone', 'is accepted for API compatibility but there is no cloned document stage in the current pipeline.');
        }
        if (options.orientation !== undefined) {
            warnLegacyOption('orientation', 'is accepted for API compatibility but page orientation should be expressed through `format` or explicit page sizes.');
        }
        if (options.pdfFileName !== undefined) {
            warnLegacyOption('pdfFileName', 'is accepted for API compatibility but only `downloadPDF(..., filename)` controls the saved filename.');
        }
        if (options.proxy !== undefined) {
            warnLegacyOption('proxy', 'is accepted for API compatibility but proxy-based resource loading is not supported in the current pipeline.');
        }
        if (options.removeContainer !== undefined) {
            warnLegacyOption('removeContainer', 'is accepted for API compatibility but there is no cloned container to remove in the current pipeline.');
        }
        if (options.scale !== undefined) {
            warnLegacyOption('scale', 'is accepted for API compatibility but snapshot rendering uses layout pixels and internal supersampling.');
        }
        if (options.scrollX !== undefined || options.scrollY !== undefined) {
            warnLegacyOption('scrollX/scrollY', 'are accepted for API compatibility but live window scroll offsets are used by the current pipeline.');
        }
        if (options.windowWidth !== undefined || options.windowHeight !== undefined) {
            warnLegacyOption('windowWidth/windowHeight', 'are accepted for API compatibility but the current pipeline reads the live DOM viewport.');
        }
        if (options.x !== undefined || options.y !== undefined || options.width !== undefined || options.height !== undefined) {
            warnLegacyOption('x/y/width/height', 'are accepted for API compatibility but snapshot cropping is not implemented in the current pipeline.');
        }
        normalized.encryption = normalizeEncryptionOptions(options.encryption);
        const fontConfigs = normalized.fontConfig ?? [];
        const langFontConfigs = normalized.langFontConfig ?? [];
        normalized.langFontConfig = langFontConfigs.length > 0 ? dedupeFontConfigs(langFontConfigs) : undefined;
        normalized.fontConfig = dedupeFontConfigs([...fontConfigs, ...langFontConfigs]);
        return normalized;
    }
    const VALID_ENCRYPTION_PERMISSIONS = new Set([
        'annot-forms',
        'copy',
        'modify',
        'print',
    ]);
    const DEFAULT_FORM_INCLUDE = [
        'text',
        'textarea',
        'select',
        'checkbox',
        'radio',
        'date-time',
        'range',
        'color',
        'file',
        'progress',
        'meter',
    ];
    function normalizeFormInclude(value) {
        switch (value) {
            case 'text':
            case 'textarea':
            case 'select':
            case 'checkbox':
            case 'radio':
            case 'date-time':
            case 'range':
            case 'color':
            case 'file':
            case 'progress':
            case 'meter':
                return value;
            default:
                return null;
        }
    }
    function normalizeFormOptions(form) {
        if (form == null || form === false || form === true) {
            const include = [...DEFAULT_FORM_INCLUDE];
            return {
                mode: 'static',
                include,
                includeSet: new Set(include),
            };
        }
        const mode = form.mode === 'interactive' || form.mode === 'hybrid' ? form.mode : 'static';
        const include = (form.include ?? DEFAULT_FORM_INCLUDE)
            .map((entry) => normalizeFormInclude(entry))
            .filter((entry) => entry !== null);
        const normalizedInclude = include.length > 0 ? include : [...DEFAULT_FORM_INCLUDE];
        return {
            mode,
            include: normalizedInclude,
            includeSet: new Set(normalizedInclude),
        };
    }
    function normalizeEncryptionOptions(encryption) {
        if (!encryption)
            return undefined;
        const normalized = {
            ownerPassword: typeof encryption.ownerPassword === 'string' ? encryption.ownerPassword : '',
            userPassword: typeof encryption.userPassword === 'string' ? encryption.userPassword : '',
            userPermissions: [],
        };
        const seen = new Set();
        for (const permission of encryption.userPermissions ?? []) {
            if (!VALID_ENCRYPTION_PERMISSIONS.has(permission)) {
                throw new Error(`dom2pdf: invalid encryption permission "${permission}"`);
            }
            if (seen.has(permission))
                continue;
            seen.add(permission);
            normalized.userPermissions.push(permission);
        }
        return normalized;
    }
    /**
     * Normalize PDF metadata options. Non-string fields are ignored; a keyword
     * array is joined with spaces (PDF convention). Returns undefined when no
     * field is set, so an empty metadata object emits no Info dictionary.
     */
    function normalizeMetadataOptions(metadata) {
        if (!metadata)
            return undefined;
        const str = (value) => (typeof value === 'string' ? value : '');
        const keywords = Array.isArray(metadata.keywords)
            ? metadata.keywords.filter((k) => typeof k === 'string').join(' ')
            : str(metadata.keywords);
        const normalized = {
            title: str(metadata.title),
            author: str(metadata.author),
            subject: str(metadata.subject),
            keywords,
            creator: str(metadata.creator),
            producer: str(metadata.producer),
            creationDate: '',
            modDate: '',
        };
        const hasAny = normalized.title !== ''
            || normalized.author !== ''
            || normalized.subject !== ''
            || normalized.keywords !== ''
            || normalized.creator !== ''
            || normalized.producer !== '';
        return hasAny ? normalized : undefined;
    }
    /** Format a Date as a PDF date string: D:YYYYMMDDHHmmSS+HH'mm' (local zone). */
    function pdfDateString(d) {
        const p2 = (n) => String(n).padStart(2, '0');
        const base = `D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`
            + `${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
        const offsetMinutes = d.getTimezoneOffset();
        if (offsetMinutes === 0)
            return `${base}Z`;
        const sign = offsetMinutes < 0 ? '+' : '-';
        const abs = Math.abs(offsetMinutes);
        return `${base}${sign}${p2(Math.floor(abs / 60))}'${p2(abs % 60)}'`;
    }
    // ---- internal types ----
    const PX_TO_PT = 0.75; // 96 dpi -> pt
    const BORDER_SOLID = 0;
    const BORDER_DASHED = 1;
    function computeLayoutScale(rootWidthPx, pageWidthPt, mLeftPt, mRightPt) {
        if (!(rootWidthPx > 0))
            return 1;
        const contentWidthPx = Math.max(1, (pageWidthPt - mLeftPt - mRightPt) / PX_TO_PT);
        return Math.min(1, contentWidthPx / rootWidthPx);
    }
    /** Image byte payload + the format tag the Rust embedder branches on. */
    const IMG_JPEG = 0;
    const IMG_RAW_RGB = 1;
    const IMG_RAW_RGBA = 2;
    /**
     * Read a fully-opaque canvas back as packed RGB888 (alpha dropped). Used for
     * flat fills and line-art icons, where JPEG's chroma loss shows up as visible
     * color drift / fuzz. Callers must have painted an opaque background first.
     */
    function canvasToRawRgb(canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return null;
        const w = canvas.width;
        const h = canvas.height;
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const rgb = new Uint8Array(w * h * 3);
        for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
            rgb[j] = rgba[i];
            rgb[j + 1] = rgba[i + 1];
            rgb[j + 2] = rgba[i + 2];
        }
        return { bytes: rgb, width: w, height: h };
    }
    function canvasToRawRgba(canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return null;
        const w = canvas.width;
        const h = canvas.height;
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const bytes = new Uint8Array(rgba.length);
        bytes.set(rgba);
        return { bytes, width: w, height: h };
    }
    function rgbaHasTransparency(rgba) {
        for (let i = 3; i < rgba.length; i += 4) {
            if (rgba[i] !== 255)
                return true;
        }
        return false;
    }
    // flag bits (must match Rust snapshot.rs)
    const F_BG = 0x01;
    const F_BORDER = 0x02;
    const F_RADIUS = 0x04;
    const F_OVERFLOW = 0x08;
    const F_OPACITY = 0x10;
    const F_FONT = 0x20;
    const F_IMAGE = 0x40;
    const F_RENDER_MODE = 0x80;
    const F_DIVISION_DISABLE = 0x100;
    const F_PAGE_BREAK = 0x200;
    const F_SHADOW = 0x400;
    const F_LINK = 0x800;
    const F_AVOID_IMAGE_SPLIT = 0x1000;
    const FORM_FIELD_KIND_TEXT = 1;
    const FORM_FIELD_KIND_TEXTAREA = 2;
    const FORM_FIELD_KIND_SELECT = 3;
    const FORM_FIELD_KIND_CHECKBOX = 4;
    const FORM_FIELD_KIND_RADIO = 5;
    const FORM_FIELD_KIND_DATE_TIME = 6;
    const FORM_FIELD_KIND_RANGE = 7;
    const FORM_FIELD_KIND_COLOR = 8;
    const FORM_FIELD_KIND_FILE = 9;
    const FORM_FIELD_KIND_PROGRESS = 10;
    const FORM_FIELD_KIND_METER = 11;
    const FORM_INTERACTIVE_NONE = 0;
    const FORM_INTERACTIVE_TEXT = 1;
    const FORM_INTERACTIVE_CHOICE = 2;
    const FORM_INTERACTIVE_CHECKBOX = 3;
    const FORM_INTERACTIVE_RADIO = 4;
    const FORM_FLAG_CHECKED = 0x01;
    const FORM_FLAG_DISABLED = 0x02;
    const FORM_FLAG_READONLY = 0x04;
    const FORM_FLAG_REQUIRED = 0x08;
    const FORM_FLAG_MULTIPLE = 0x10;
    const FORM_FLAG_PLACEHOLDER_SHOWN = 0x20;
    const FORM_FLAG_PASSWORD = 0x40;
    function normalizeInputType(type) {
        return (type || 'text').trim().toLowerCase() || 'text';
    }
    function isDateTimeInputType(type) {
        return type === 'date'
            || type === 'time'
            || type === 'month'
            || type === 'week'
            || type === 'datetime-local';
    }
    function formIncludeForInputType(type) {
        if (type === 'checkbox')
            return 'checkbox';
        if (type === 'radio')
            return 'radio';
        if (isDateTimeInputType(type))
            return 'date-time';
        if (type === 'range')
            return 'range';
        if (type === 'color')
            return 'color';
        if (type === 'file')
            return 'file';
        return 'text';
    }
    function shouldEmitInteractiveFormField(form, interactiveKind) {
        return form.mode !== 'static' && interactiveKind !== FORM_INTERACTIVE_NONE;
    }
    function isTextualFormKind(kind) {
        return kind === FORM_FIELD_KIND_TEXT
            || kind === FORM_FIELD_KIND_TEXTAREA
            || kind === FORM_FIELD_KIND_SELECT
            || kind === FORM_FIELD_KIND_DATE_TIME;
    }
    function shouldRasterizeStaticFormControl(kind) {
        return kind === FORM_FIELD_KIND_CHECKBOX
            || kind === FORM_FIELD_KIND_RADIO
            || kind === FORM_FIELD_KIND_RANGE
            || kind === FORM_FIELD_KIND_COLOR
            || kind === FORM_FIELD_KIND_FILE
            || kind === FORM_FIELD_KIND_PROGRESS
            || kind === FORM_FIELD_KIND_METER;
    }
    function shouldSuppressBaseNodeForInteractiveField(kind) {
        return kind === FORM_FIELD_KIND_CHECKBOX || kind === FORM_FIELD_KIND_RADIO;
    }
    function collectSelectOptions(select) {
        return Array.from(select.options).map((option) => ({
            label: option.text,
            value: option.value,
            selected: option.selected,
        }));
    }
    function analyzeFormControl(el, cs, form) {
        // Type gate first: callers invoke this on every full-raster element (SVG,
        // canvas, ...), so non-control elements must bail before any style parsing.
        if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)
            && !(el instanceof HTMLSelectElement) && !(el instanceof HTMLProgressElement)
            && !(el instanceof HTMLMeterElement)) {
            return null;
        }
        const textAlign = alignNum(cs.textAlign);
        const padding = [
            parseFloat(cs.paddingTop) || 0,
            parseFloat(cs.paddingRight) || 0,
            parseFloat(cs.paddingBottom) || 0,
            parseFloat(cs.paddingLeft) || 0,
        ];
        if (el instanceof HTMLInputElement) {
            const type = normalizeInputType(el.type);
            const include = formIncludeForInputType(type);
            if (!include || !form.includeSet.has(include))
                return null;
            if (type === 'checkbox') {
                return {
                    kind: FORM_FIELD_KIND_CHECKBOX,
                    interactiveKind: FORM_INTERACTIVE_CHECKBOX,
                    name: el.name || '',
                    value: el.checked ? 'Yes' : 'Off',
                    defaultValue: el.defaultChecked ? 'Yes' : 'Off',
                    placeholder: '',
                    checked: el.checked,
                    disabled: el.disabled,
                    readonly: false,
                    required: el.required,
                    multiple: false,
                    placeholderShown: false,
                    password: false,
                    textAlign,
                    padding,
                    options: [],
                    hiddenText: '',
                };
            }
            if (type === 'radio') {
                return {
                    kind: FORM_FIELD_KIND_RADIO,
                    interactiveKind: FORM_INTERACTIVE_RADIO,
                    name: el.name || '',
                    value: el.value || `radio-${el.id || 'option'}`,
                    defaultValue: el.defaultChecked ? (el.value || `radio-${el.id || 'option'}`) : '',
                    placeholder: '',
                    checked: el.checked,
                    disabled: el.disabled,
                    readonly: false,
                    required: el.required,
                    multiple: false,
                    placeholderShown: false,
                    password: false,
                    textAlign,
                    padding,
                    options: [],
                    hiddenText: '',
                };
            }
            if (type === 'range') {
                return {
                    kind: FORM_FIELD_KIND_RANGE,
                    interactiveKind: FORM_INTERACTIVE_NONE,
                    name: el.name || '',
                    value: el.value,
                    defaultValue: el.defaultValue,
                    placeholder: '',
                    checked: false,
                    disabled: el.disabled,
                    readonly: false,
                    required: el.required,
                    multiple: false,
                    placeholderShown: false,
                    password: false,
                    textAlign,
                    padding,
                    options: [],
                    hiddenText: el.value,
                };
            }
            if (type === 'color') {
                return {
                    kind: FORM_FIELD_KIND_COLOR,
                    interactiveKind: FORM_INTERACTIVE_NONE,
                    name: el.name || '',
                    value: el.value,
                    defaultValue: el.defaultValue,
                    placeholder: '',
                    checked: false,
                    disabled: el.disabled,
                    readonly: false,
                    required: el.required,
                    multiple: false,
                    placeholderShown: false,
                    password: false,
                    textAlign,
                    padding,
                    options: [],
                    hiddenText: el.value,
                };
            }
            if (type === 'file') {
                const fileNames = el.files ? Array.from(el.files).map((file) => file.name) : [];
                return {
                    kind: FORM_FIELD_KIND_FILE,
                    interactiveKind: FORM_INTERACTIVE_NONE,
                    name: el.name || '',
                    value: fileNames.join('\n'),
                    defaultValue: '',
                    placeholder: '',
                    checked: false,
                    disabled: el.disabled,
                    readonly: false,
                    required: el.required,
                    multiple: el.multiple,
                    placeholderShown: false,
                    password: false,
                    textAlign,
                    padding,
                    options: [],
                    hiddenText: fileNames.join('\n'),
                };
            }
            const placeholder = el.placeholder || '';
            const value = el.value || '';
            const placeholderShown = value.length === 0 && placeholder.length > 0;
            const password = type === 'password';
            return {
                kind: isDateTimeInputType(type) ? FORM_FIELD_KIND_DATE_TIME : FORM_FIELD_KIND_TEXT,
                interactiveKind: FORM_INTERACTIVE_TEXT,
                name: el.name || '',
                value,
                defaultValue: el.defaultValue,
                placeholder,
                checked: false,
                disabled: el.disabled,
                readonly: el.readOnly,
                required: el.required,
                multiple: false,
                placeholderShown,
                password,
                textAlign,
                padding,
                options: [],
                hiddenText: placeholderShown
                    ? placeholder
                    : password
                        ? '•'.repeat(Array.from(value).length)
                        : value,
            };
        }
        if (el instanceof HTMLTextAreaElement) {
            if (!form.includeSet.has('textarea'))
                return null;
            const placeholder = el.placeholder || '';
            const value = el.value || '';
            const placeholderShown = value.length === 0 && placeholder.length > 0;
            return {
                kind: FORM_FIELD_KIND_TEXTAREA,
                interactiveKind: FORM_INTERACTIVE_TEXT,
                name: el.name || '',
                value,
                defaultValue: el.defaultValue,
                placeholder,
                checked: false,
                disabled: el.disabled,
                readonly: el.readOnly,
                required: el.required,
                multiple: true,
                placeholderShown,
                password: false,
                textAlign,
                padding,
                options: [],
                hiddenText: placeholderShown ? placeholder : value,
            };
        }
        if (el instanceof HTMLSelectElement) {
            if (!form.includeSet.has('select'))
                return null;
            const options = collectSelectOptions(el);
            const selectedOptions = options.filter((option) => option.selected);
            return {
                kind: FORM_FIELD_KIND_SELECT,
                interactiveKind: FORM_INTERACTIVE_CHOICE,
                name: el.name || '',
                value: selectedOptions.map((option) => option.value).join('\n'),
                defaultValue: Array.from(el.options).filter((option) => option.defaultSelected).map((option) => option.value).join('\n'),
                placeholder: '',
                checked: false,
                disabled: el.disabled,
                readonly: false,
                required: el.required,
                multiple: el.multiple,
                placeholderShown: false,
                password: false,
                textAlign,
                padding,
                options,
                hiddenText: selectedOptions.map((option) => option.label).join('\n'),
            };
        }
        if (el instanceof HTMLProgressElement) {
            if (!form.includeSet.has('progress'))
                return null;
            return {
                kind: FORM_FIELD_KIND_PROGRESS,
                interactiveKind: FORM_INTERACTIVE_NONE,
                name: el.getAttribute('name') || '',
                value: String(el.value),
                defaultValue: String(el.value),
                placeholder: '',
                checked: false,
                disabled: false,
                readonly: true,
                required: false,
                multiple: false,
                placeholderShown: false,
                password: false,
                textAlign,
                padding,
                options: [],
                hiddenText: `${el.value}/${el.max || 1}`,
            };
        }
        if (el instanceof HTMLMeterElement) {
            if (!form.includeSet.has('meter'))
                return null;
            return {
                kind: FORM_FIELD_KIND_METER,
                interactiveKind: FORM_INTERACTIVE_NONE,
                name: el.getAttribute('name') || '',
                value: String(el.value),
                defaultValue: String(el.value),
                placeholder: '',
                checked: false,
                disabled: false,
                readonly: true,
                required: false,
                multiple: false,
                placeholderShown: false,
                password: false,
                textAlign,
                padding,
                options: [],
                hiddenText: `${el.value}`,
            };
        }
        return null;
    }
    function isHFSemanticPosition(value) {
        return value === 'center'
            || value === 'centerLeft'
            || value === 'centerRight'
            || value === 'centerTop'
            || value === 'centerBottom'
            || value === 'leftTop'
            || value === 'leftBottom'
            || value === 'rightTop'
            || value === 'rightBottom';
    }
    function isHFCoordinatePosition(value) {
        return !!value
            && typeof value === 'object'
            && !Array.isArray(value)
            && 'x' in value
            && 'y' in value;
    }
    // header/footer position enum (must match Rust HFSpec.position / HFSlotCustomPosition.anchor)
    function positionNum(p) {
        if (Array.isArray(p))
            return 9;
        switch (p) {
            case 'center': return 0;
            case 'centerLeft': return 1;
            case 'centerRight': return 2;
            case 'centerTop': return 3;
            case 'centerBottom': return 4;
            case 'leftTop': return 5;
            case 'leftBottom': return 6;
            case 'rightTop': return 7;
            case 'rightBottom': return 8;
            default: return 0;
        }
    }
    function parseHFCoordinateValue(value) {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? { pct: 0, offsetPx: value } : null;
        }
        if (typeof value !== 'string')
            return null;
        const compact = value.trim().toLowerCase().replace(/\s+/g, '');
        if (!compact)
            return null;
        const pctMatch = /^([+-]?\d+(?:\.\d+)?)%(?:(\+|-)(\d+(?:\.\d+)?)(?:px)?)?$/.exec(compact);
        if (pctMatch) {
            const pct = parseFloat(pctMatch[1]);
            const offset = pctMatch[2]
                ? (pctMatch[2] === '-' ? -1 : 1) * parseFloat(pctMatch[3])
                : 0;
            return Number.isFinite(pct) && Number.isFinite(offset)
                ? { pct: pct / 100, offsetPx: offset }
                : null;
        }
        const pxMatch = /^([+-]?\d+(?:\.\d+)?)(?:px)?$/.exec(compact);
        if (!pxMatch)
            return null;
        const offset = parseFloat(pxMatch[1]);
        return Number.isFinite(offset) ? { pct: 0, offsetPx: offset } : null;
    }
    // ---- color parsing via canvas ----
    const colorCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const colorCtx = colorCanvas ? colorCanvas.getContext('2d') : null;
    const colorCache = new Map();
    function parseColor(str) {
        if (!colorCtx)
            return [0, 0, 0, 1];
        if (!str)
            return [0, 0, 0, 0];
        const cached = colorCache.get(str);
        if (cached)
            return cached;
        let result;
        // Fast path for #rrggbb / #rgb (avoids canvas round-trip).
        if (str.charCodeAt(0) === 35 /* '#' */) {
            const hex = str.slice(1);
            if (hex.length === 6) {
                result = [
                    parseInt(hex.slice(0, 2), 16) / 255,
                    parseInt(hex.slice(2, 4), 16) / 255,
                    parseInt(hex.slice(4, 6), 16) / 255,
                    1,
                ];
            }
            else if (hex.length === 3) {
                result = [
                    parseInt(hex[0] + hex[0], 16) / 255,
                    parseInt(hex[1] + hex[1], 16) / 255,
                    parseInt(hex[2] + hex[2], 16) / 255,
                    1,
                ];
            }
            else {
                result = parseColorViaCanvas(str);
            }
        }
        else {
            result = parseColorViaCanvas(str);
        }
        colorCache.set(str, result);
        return result;
    }
    function parseColorViaCanvas(str) {
        colorCtx.fillStyle = '#000';
        colorCtx.fillStyle = str;
        const f = colorCtx.fillStyle;
        if (typeof f === 'string' && f.startsWith('#')) {
            return [
                parseInt(f.slice(1, 3), 16) / 255,
                parseInt(f.slice(3, 5), 16) / 255,
                parseInt(f.slice(5, 7), 16) / 255,
                1,
            ];
        }
        const m = /rgba?\(([^)]+)\)/.exec(f);
        if (m) {
            const p = m[1].split(',').map((s) => parseFloat(s));
            return [p[0] / 255, p[1] / 255, p[2] / 255, p[3] === undefined ? 1 : p[3]];
        }
        // CSS Color 4 values such as oklch()/lab()/color(display-p3 ...)
        // may survive in canvas.fillStyle as-is instead of normalizing to rgb(...).
        // Sample a painted pixel to force the browser to resolve them.
        try {
            colorCtx.clearRect(0, 0, 1, 1);
            colorCtx.fillRect(0, 0, 1, 1);
            const data = colorCtx.getImageData(0, 0, 1, 1).data;
            return [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];
        }
        catch {
            // ignore and fall through
        }
        return [0, 0, 0, 0];
    }
    function weightNum(w) {
        if (w === 'bold')
            return 700;
        if (w === 'normal')
            return 400;
        const n = parseInt(w, 10);
        return isNaN(n) ? 400 : n;
    }
    function alignNum(a) {
        switch (a) {
            case 'right': return 1;
            case 'center': return 2;
            case 'justify': return 3;
            default: return 0;
        }
    }
    function textDecorationMask(cs) {
        const value = ((cs.textDecorationLine || cs.textDecoration || '') + '').toLowerCase();
        let mask = 0;
        if (value.includes('underline'))
            mask |= 0x01;
        if (value.includes('line-through'))
            mask |= 0x02;
        if (value.includes('overline'))
            mask |= 0x04;
        return mask;
    }
    function objectFitNum(v) {
        switch ((v || '').trim()) {
            case 'contain': return 1;
            case 'cover': return 2;
            case 'none': return 3;
            case 'scale-down': return 4;
            default: return 0;
        }
    }
    function objectPositionAxisDefault() {
        return { pct: 0.5, offsetPx: 0 };
    }
    function splitPositionTokens(value) {
        const out = [];
        let depth = 0;
        let start = -1;
        for (let i = 0; i < value.length; i++) {
            const ch = value[i];
            if (ch === '(')
                depth++;
            else if (ch === ')')
                depth = Math.max(0, depth - 1);
            if (/\s/.test(ch) && depth === 0) {
                if (start !== -1) {
                    out.push(value.slice(start, i));
                    start = -1;
                }
                continue;
            }
            if (start === -1)
                start = i;
        }
        if (start !== -1)
            out.push(value.slice(start));
        return out;
    }
    function parsePositionToken(token) {
        const trimmed = (token || '').trim().toLowerCase();
        if (!trimmed)
            return null;
        const calcMatch = /^calc\(\s*(-?\d+(?:\.\d+)?)%\s*([+-])\s*(-?\d+(?:\.\d+)?)px\s*\)$/i.exec(trimmed);
        if (calcMatch) {
            const pct = parseFloat(calcMatch[1]);
            const px = parseFloat(calcMatch[3]);
            if (Number.isFinite(pct) && Number.isFinite(px)) {
                return {
                    kind: 'mixed',
                    pct: pct / 100,
                    offsetPx: calcMatch[2] === '+' ? px : -px,
                };
            }
        }
        if (trimmed.endsWith('%')) {
            const n = parseFloat(trimmed.slice(0, -1));
            return Number.isFinite(n) ? { kind: 'pct', value: n / 100 } : null;
        }
        const n = parseFloat(trimmed);
        return Number.isFinite(n) ? { kind: 'px', value: n } : null;
    }
    function isXPositionKeyword(token) {
        return token === 'left' || token === 'right' || token === 'center';
    }
    function isYPositionKeyword(token) {
        return token === 'top' || token === 'bottom' || token === 'center';
    }
    function parseObjectPositionAxis(keywordToken, valueToken, axis) {
        const keyword = (keywordToken || '').trim().toLowerCase();
        const parsedValue = valueToken ? parsePositionToken(valueToken) : null;
        const positiveEdge = axis === 'x' ? 'right' : 'bottom';
        const negativeEdge = axis === 'x' ? 'left' : 'top';
        if (!keyword) {
            if (!parsedValue)
                return null;
            if (parsedValue.kind === 'mixed') {
                return { pct: parsedValue.pct, offsetPx: parsedValue.offsetPx };
            }
            return parsedValue.kind === 'pct'
                ? { pct: parsedValue.value, offsetPx: 0 }
                : { pct: 0, offsetPx: parsedValue.value };
        }
        if (keyword === 'center') {
            if (!parsedValue)
                return { pct: 0.5, offsetPx: 0 };
            if (parsedValue.kind === 'mixed') {
                return { pct: 0.5 + parsedValue.pct, offsetPx: parsedValue.offsetPx };
            }
            return parsedValue.kind === 'pct'
                ? { pct: 0.5 + parsedValue.value, offsetPx: 0 }
                : { pct: 0.5, offsetPx: parsedValue.value };
        }
        if (keyword === negativeEdge) {
            if (!parsedValue)
                return { pct: 0, offsetPx: 0 };
            if (parsedValue.kind === 'mixed') {
                return { pct: parsedValue.pct, offsetPx: parsedValue.offsetPx };
            }
            return parsedValue.kind === 'pct'
                ? { pct: parsedValue.value, offsetPx: 0 }
                : { pct: 0, offsetPx: parsedValue.value };
        }
        if (keyword === positiveEdge) {
            if (!parsedValue)
                return { pct: 1, offsetPx: 0 };
            if (parsedValue.kind === 'mixed') {
                return { pct: 1 - parsedValue.pct, offsetPx: -parsedValue.offsetPx };
            }
            return parsedValue.kind === 'pct'
                ? { pct: 1 - parsedValue.value, offsetPx: 0 }
                : { pct: 1, offsetPx: -parsedValue.value };
        }
        return null;
    }
    function parseObjectPosition(value) {
        const tokens = splitPositionTokens((value || '').trim().toLowerCase());
        const x = objectPositionAxisDefault();
        const y = objectPositionAxisDefault();
        if (tokens.length === 0)
            return { x, y };
        const applyAxis = (target, next) => {
            if (!next)
                return;
            target.pct = next.pct;
            target.offsetPx = next.offsetPx;
        };
        if (tokens.length >= 4) {
            const firstKeyword = tokens[0];
            const secondKeyword = tokens[2];
            const firstValue = parsePositionToken(tokens[1]);
            const secondValue = parsePositionToken(tokens[3]);
            if (firstValue && secondValue) {
                if (firstKeyword !== 'center' && secondKeyword !== 'center') {
                    if (isXPositionKeyword(firstKeyword) && isYPositionKeyword(secondKeyword)) {
                        applyAxis(x, parseObjectPositionAxis(firstKeyword, tokens[1], 'x'));
                        applyAxis(y, parseObjectPositionAxis(secondKeyword, tokens[3], 'y'));
                        return { x, y };
                    }
                    if (isYPositionKeyword(firstKeyword) && isXPositionKeyword(secondKeyword)) {
                        applyAxis(y, parseObjectPositionAxis(firstKeyword, tokens[1], 'y'));
                        applyAxis(x, parseObjectPositionAxis(secondKeyword, tokens[3], 'x'));
                        return { x, y };
                    }
                }
            }
        }
        if (tokens.length === 1) {
            const token = tokens[0];
            if (token === 'top' || token === 'bottom')
                applyAxis(y, parseObjectPositionAxis(token, null, 'y'));
            else if (token === 'left' || token === 'right')
                applyAxis(x, parseObjectPositionAxis(token, null, 'x'));
            else if (token === 'center') {
                applyAxis(x, parseObjectPositionAxis(token, null, 'x'));
                applyAxis(y, parseObjectPositionAxis(token, null, 'y'));
            }
            else {
                applyAxis(x, parseObjectPositionAxis(null, token, 'x'));
            }
            return { x, y };
        }
        if (tokens.length === 2) {
            const [t0, t1] = tokens;
            if ((t0 === 'top' || t0 === 'bottom') && isXPositionKeyword(t1)) {
                applyAxis(y, parseObjectPositionAxis(t0, null, 'y'));
                applyAxis(x, parseObjectPositionAxis(t1, null, 'x'));
                return { x, y };
            }
            if ((t1 === 'top' || t1 === 'bottom') && isXPositionKeyword(t0)) {
                applyAxis(x, parseObjectPositionAxis(t0, null, 'x'));
                applyAxis(y, parseObjectPositionAxis(t1, null, 'y'));
                return { x, y };
            }
            if (t0 === 'top' || t0 === 'bottom') {
                applyAxis(y, parseObjectPositionAxis(t0, null, 'y'));
                applyAxis(x, parseObjectPositionAxis(null, t1, 'x'));
                return { x, y };
            }
            if (t1 === 'top' || t1 === 'bottom') {
                applyAxis(x, parseObjectPositionAxis(null, t0, 'x'));
                applyAxis(y, parseObjectPositionAxis(t1, null, 'y'));
                return { x, y };
            }
            applyAxis(x, parseObjectPositionAxis(t0, null, 'x') ?? parseObjectPositionAxis(null, t0, 'x'));
            applyAxis(y, parseObjectPositionAxis(t1, null, 'y') ?? parseObjectPositionAxis(null, t1, 'y'));
            return { x, y };
        }
        if (tokens.length === 3) {
            const [t0, t1, t2] = tokens;
            if ((t0 === 'left' || t0 === 'right') && parsePositionToken(t1) && isYPositionKeyword(t2)) {
                applyAxis(x, parseObjectPositionAxis(t0, t1, 'x'));
                applyAxis(y, parseObjectPositionAxis(t2, null, 'y'));
                return { x, y };
            }
            if ((t0 === 'top' || t0 === 'bottom') && parsePositionToken(t1) && isXPositionKeyword(t2)) {
                applyAxis(y, parseObjectPositionAxis(t0, t1, 'y'));
                applyAxis(x, parseObjectPositionAxis(t2, null, 'x'));
                return { x, y };
            }
            if (isXPositionKeyword(t0) && (t1 === 'top' || t1 === 'bottom') && parsePositionToken(t2)) {
                applyAxis(x, parseObjectPositionAxis(t0, null, 'x'));
                applyAxis(y, parseObjectPositionAxis(t1, t2, 'y'));
                return { x, y };
            }
            if (isYPositionKeyword(t0) && (t1 === 'left' || t1 === 'right') && parsePositionToken(t2)) {
                applyAxis(y, parseObjectPositionAxis(t0, null, 'y'));
                applyAxis(x, parseObjectPositionAxis(t1, t2, 'x'));
                return { x, y };
            }
        }
        applyAxis(x, parseObjectPositionAxis(tokens[0], null, 'x') ?? parseObjectPositionAxis(null, tokens[0], 'x'));
        if (tokens.length > 1) {
            applyAxis(y, parseObjectPositionAxis(tokens[1], null, 'y') ?? parseObjectPositionAxis(null, tokens[1], 'y'));
        }
        return { x, y };
    }
    function borderStyleNum(style) {
        return style === 'dashed' ? BORDER_DASHED : BORDER_SOLID;
    }
    function clipsOverflow(cs) {
        const check = (value) => {
            const parts = (value || '').split(/\s+/);
            for (let i = 0; i < parts.length; i++) {
                const v = parts[i];
                if (v === 'hidden' || v === 'clip' || v === 'scroll' || v === 'auto')
                    return true;
            }
            return false;
        };
        return check(cs.overflow) || check(cs.overflowX) || check(cs.overflowY);
    }
    function utf8LenCP(cp) {
        if (cp < 0x80)
            return 1;
        if (cp < 0x800)
            return 2;
        if (cp < 0x10000)
            return 3;
        return 4;
    }
    function utf8Offsets(text) {
        const n = text.length;
        const off = new Int32Array(n + 1);
        let acc = 0;
        for (let i = 0; i < n; i++) {
            const c = text.charCodeAt(i);
            if (c >= 0xd800 && c <= 0xdbff && i + 1 < n) {
                const low = text.charCodeAt(i + 1);
                if (low >= 0xdc00 && low <= 0xdfff) {
                    const cp = 0x10000 + ((c - 0xd800) << 10) + (low - 0xdc00);
                    acc += utf8LenCP(cp);
                    off[i + 1] = off[i];
                    off[i + 2] = acc;
                    i++;
                    continue;
                }
            }
            acc += utf8LenCP(c);
            off[i + 1] = acc;
        }
        return off;
    }
    function segmentGraphemes(text) {
        if (!text)
            return [];
        const SegmenterCtor = Intl.Segmenter;
        if (SegmenterCtor) {
            const segmenter = new SegmenterCtor(undefined, { granularity: 'grapheme' });
            const out = [];
            for (const part of segmenter.segment(text)) {
                out.push({
                    text: part.segment,
                    start16: part.index,
                    end16: part.index + part.segment.length,
                });
            }
            return out;
        }
        const out = [];
        for (let i = 0; i < text.length;) {
            const cp = text.codePointAt(i);
            if (cp == null)
                break;
            const len = cp > 0xFFFF ? 2 : 1;
            out.push({ text: text.slice(i, i + len), start16: i, end16: i + len });
            i += len;
        }
        return out;
    }
    function isBitmapFallbackCodePoint(cp) {
        return ((cp >= 0x2190 && cp <= 0x21FF) // arrows
            || (cp >= 0x2300 && cp <= 0x23FF) // misc technical / emoji symbols
            || (cp >= 0x2460 && cp <= 0x24FF) // enclosed numbers/symbols
            || (cp >= 0x2500 && cp <= 0x259F) // box drawing + block elements
            || (cp >= 0x25A0 && cp <= 0x25FF) // geometric shapes
            || (cp >= 0x2600 && cp <= 0x27FF) // misc symbols, dingbats, arrows
            || (cp >= 0x2900 && cp <= 0x2BFF) // supplemental arrows / misc symbols
            || (cp >= 0xFE00 && cp <= 0xFE0F) // variation selectors
            || cp === 0x200D // ZWJ emoji sequences
            || (cp >= 0x1F000 && cp <= 0x1FAFF) // emoji blocks
        );
    }
    function graphemeNeedsBitmapFallback(grapheme) {
        for (const ch of grapheme) {
            const cp = ch.codePointAt(0);
            if (cp != null && isBitmapFallbackCodePoint(cp))
                return true;
        }
        return false;
    }
    async function convertImage(img, quality, useCORS) {
        try {
            const src = img.currentSrc || img.src;
            let sourceImg = img;
            if (src) {
                try {
                    const protocol = new URL(src, document.baseURI).protocol;
                    if (useCORS && /^https?:$/i.test(protocol)) {
                        sourceImg = await loadImageFromUrl(src, 'anonymous');
                    }
                }
                catch {
                    // Ignore URL parse failures and fall back to the live element.
                }
            }
            if (!sourceImg.complete || sourceImg.naturalWidth === 0) {
                await sourceImg.decode().catch(() => null);
            }
            const rect = img.getBoundingClientRect();
            const naturalW = Math.max(1, Math.round(sourceImg.naturalWidth || img.naturalWidth || sourceImg.width || img.width || 0));
            const naturalH = Math.max(1, Math.round(sourceImg.naturalHeight || img.naturalHeight || sourceImg.height || img.height || 0));
            const cssW = Math.max(1, Math.round(rect.width || img.width || naturalW || 0));
            const cssH = Math.max(1, Math.round(rect.height || img.height || naturalH || 0));
            // Preserve the source image's intrinsic aspect ratio here; layout-driven
            // fitting like object-fit/object-position is applied later during PDF draw.
            const w = naturalW || cssW;
            const h = naturalH || cssH;
            if (!w || !h)
                return null;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(sourceImg, 0, 0, w, h);
            let rgba;
            try {
                rgba = ctx.getImageData(0, 0, w, h).data;
            }
            catch {
                const raster = await rasterizeElement(img, img.getBoundingClientRect(), quality, getComputedStyle(img));
                if (!raster)
                    return null;
                return { bytes: raster.bytes, width: raster.width, height: raster.height, format: raster.format };
            }
            if (rgbaHasTransparency(rgba)) {
                const bytes = new Uint8Array(rgba.length);
                bytes.set(rgba);
                return { bytes, width: w, height: h, format: IMG_RAW_RGBA };
            }
            const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
            if (!blob)
                return null;
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return { bytes, width: w, height: h, format: IMG_JPEG };
        }
        catch {
            return null;
        }
    }
    function splitTopLevelComma(input) {
        const out = [];
        let start = 0;
        let depth = 0;
        for (let i = 0; i < input.length; i++) {
            const ch = input[i];
            if (ch === '(')
                depth++;
            else if (ch === ')')
                depth = Math.max(0, depth - 1);
            else if (ch === ',' && depth === 0) {
                out.push(input.slice(start, i).trim());
                start = i + 1;
            }
        }
        out.push(input.slice(start).trim());
        return out.filter(Boolean);
    }
    function pxNumber(value) {
        const n = parseFloat(value || '');
        return Number.isFinite(n) ? n : 0;
    }
    // Cached canvas used by measureTextWidth. Reused across calls to avoid
    // allocating a new <canvas> per marker measurement.
    let _measureCanvas = null;
    // Measure a text run's width in CSS pixels using the given CSS font shorthand
    // (e.g. "700 16px Arial"). Falls back to 0 when Canvas2D is unavailable.
    function measureTextWidth(text, fontShorthand) {
        if (!text)
            return 0;
        if (!_measureCanvas)
            _measureCanvas = document.createElement('canvas');
        const ctx = _measureCanvas.getContext('2d');
        if (!ctx)
            return 0;
        ctx.font = fontShorthand;
        return ctx.measureText(text).width;
    }
    function cssQuotedContentToText(content) {
        const trimmed = (content || '').trim();
        if (!trimmed || trimmed === 'none' || trimmed === 'normal')
            return null;
        if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
            || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
            const quote = trimmed[0];
            let body = trimmed.slice(1, -1);
            body = body.replace(/\\A\s*/g, '\n');
            body = body.replace(/\\(['"\\])/g, '$1');
            if (quote === '\'')
                body = body.replace(/\\"/g, '"');
            if (!body)
                return null;
            return body;
        }
        return trimmed;
    }
    // Convert a 1-based index to alphabetic (a, b, ..., z, aa, ab, ...).
    function decimalToAlpha(n, upper) {
        if (n < 1)
            return String(n);
        let s = '';
        let v = n;
        while (v > 0) {
            v--;
            s = String.fromCharCode(97 + (v % 26)) + s;
            v = Math.floor(v / 26);
        }
        return upper ? s.toUpperCase() : s;
    }
    // Convert a 1-based index to Roman numerals (i, ii, iii, iv, ...).
    function decimalToRoman(n, upper) {
        if (n < 1)
            return String(n);
        const table = [
            [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
            [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
            [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
        ];
        let s = '';
        let v = n;
        for (const [val, sym] of table) {
            while (v >= val) {
                s += sym;
                v -= val;
            }
        }
        return upper ? s : s.toLowerCase();
    }
    // Resolve ::marker text. Priority: explicit `content` string > list-style-type.
    // Returns null when the marker should not render (list-style-type: none or
    // content: none). `index` is 1-based and only used for counter-based styles.
    function markerTextFromListStyle(listStyleType, contentValue, index) {
        // Explicit `content: "..."` wins over list-style-type.
        const quoted = cssQuotedContentToText(contentValue);
        if (quoted !== null)
            return quoted;
        const t = (listStyleType || 'disc').trim().toLowerCase();
        if (t === 'none')
            return null;
        switch (t) {
            case 'disc': return '\u2022';
            case 'circle': return '\u25E6';
            case 'square': return '\u25AA';
            case 'decimal': return `${index}.`;
            case 'decimal-leading-zero': return `${String(index).padStart(2, '0')}.`;
            case 'lower-alpha':
            case 'lower-latin': return `${decimalToAlpha(index, false)}.`;
            case 'upper-alpha':
            case 'upper-latin': return `${decimalToAlpha(index, true)}.`;
            case 'lower-roman': return `${decimalToRoman(index, false)}.`;
            case 'upper-roman': return `${decimalToRoman(index, true)}.`;
            default: return '\u2022';
        }
    }
    // Compute the 1-based index of an <li> among its sibling <li>s, honoring
    // <ol start> and per-item <li value> overrides. Returns null when the element
    // is not a direct child of an <ol>/<ul>.
    function computeListItemIndex(li) {
        const parent = li.parentElement;
        if (!parent)
            return null;
        const tag = parent.tagName.toUpperCase();
        if (tag !== 'OL' && tag !== 'UL')
            return null;
        let idx = 1;
        if (tag === 'OL') {
            const startAttr = parent.getAttribute('start');
            if (startAttr !== null) {
                const s = parseInt(startAttr, 10);
                idx = isNaN(s) ? 1 : Math.max(1, s);
            }
        }
        for (let child = parent.firstElementChild; child; child = child.nextElementSibling) {
            if (child === li)
                return idx;
            if (child.tagName.toUpperCase() === 'LI') {
                const valueAttr = child.getAttribute('value');
                if (valueAttr !== null) {
                    const v = parseInt(valueAttr, 10);
                    if (!isNaN(v))
                        idx = v;
                }
                idx++;
            }
        }
        return null;
    }
    function hasVisibleBorder(cs) {
        return ((pxNumber(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && cs.borderTopStyle !== 'hidden')
            || (pxNumber(cs.borderRightWidth) > 0 && cs.borderRightStyle !== 'none' && cs.borderRightStyle !== 'hidden')
            || (pxNumber(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none' && cs.borderBottomStyle !== 'hidden')
            || (pxNumber(cs.borderLeftWidth) > 0 && cs.borderLeftStyle !== 'none' && cs.borderLeftStyle !== 'hidden')) && parseColor(cs.borderTopColor)[3] > 0.001;
    }
    function pseudoHasVisual(cs) {
        const pseudoText = cssQuotedContentToText(cs.content);
        // Ignore clearfix-style pseudo elements like `content: " "` that only exist
        // for layout; treating them as visual forces large containers into full-raster.
        const hasContent = !!pseudoText && pseudoText.trim().length > 0;
        const bg = parseColor(cs.backgroundColor);
        const hasBg = bg[3] > 0.001;
        const hasBox = pxNumber(cs.width) > 0 && pxNumber(cs.height) > 0;
        return hasContent || hasBg || hasBox || hasVisibleBorder(cs);
    }
    function pseudoNeedsForegroundRaster(cs) {
        const pseudoText = cssQuotedContentToText(cs.content);
        return !!pseudoText && pseudoText.trim().length > 0;
    }
    function hasComplexBackground(cs) {
        const bgImage = (cs.backgroundImage || '').trim();
        if (!bgImage || bgImage === 'none')
            return false;
        if (bgImage.includes('url('))
            return true;
        const size = (cs.backgroundSize || '').trim();
        const position = (cs.backgroundPosition || '').trim();
        const repeat = (cs.backgroundRepeat || '').trim();
        return !((size === '' || size === 'auto' || size === 'auto auto')
            && (position === '' || position === '0% 0%')
            && (repeat === '' || repeat === 'repeat' || repeat === 'repeat repeat'));
    }
    function computeBoxShadowPadding(boxShadow) {
        const pad = { top: 0, right: 0, bottom: 0, left: 0 };
        const layers = splitTopLevelComma(boxShadow || '');
        for (const layer of layers) {
            const trimmed = layer.trim();
            if (!trimmed || trimmed === 'none' || /\binset\b/i.test(trimmed))
                continue;
            const lengths = Array.from(trimmed.matchAll(/-?\d+(?:\.\d+)?px/g)).map((m) => parseFloat(m[0]));
            if (lengths.length < 2)
                continue;
            const offsetX = lengths[0] || 0;
            const offsetY = lengths[1] || 0;
            const blur = Math.max(0, lengths[2] || 0);
            const spread = lengths[3] || 0;
            const extent = Math.max(0, blur * 2 + spread);
            pad.left = Math.max(pad.left, extent - offsetX);
            pad.right = Math.max(pad.right, extent + offsetX);
            pad.top = Math.max(pad.top, extent - offsetY);
            pad.bottom = Math.max(pad.bottom, extent + offsetY);
        }
        pad.top = Math.max(0, Math.ceil(pad.top));
        pad.right = Math.max(0, Math.ceil(pad.right));
        pad.bottom = Math.max(0, Math.ceil(pad.bottom));
        pad.left = Math.max(0, Math.ceil(pad.left));
        return pad;
    }
    function parseBoxShadow(boxShadow) {
        const out = [];
        const layers = splitTopLevelComma(boxShadow || '');
        for (const layer of layers) {
            const trimmed = layer.trim();
            if (!trimmed || trimmed === 'none' || /\binset\b/i.test(trimmed))
                continue;
            const lengths = Array.from(trimmed.matchAll(/-?\d+(?:\.\d+)?px/g)).map((m) => parseFloat(m[0]));
            if (lengths.length < 2)
                continue;
            const x = lengths[0] || 0;
            const y = lengths[1] || 0;
            const blur = Math.max(0, lengths[2] || 0);
            const spread = lengths[3] || 0;
            const colorMatch = trimmed.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]+|transparent)/);
            const color = parseColor(colorMatch ? colorMatch[1] : 'rgba(0,0,0,0.25)');
            if (color[3] <= 0.001)
                continue;
            out.push({ x, y, blur, spread, color });
        }
        return out;
    }
    function findOpaqueBackdropColor(el) {
        let rAcc = 0, gAcc = 0, bAcc = 0;
        let alphaRem = 1.0;
        for (let cur = el.parentElement; cur; cur = cur.parentElement) {
            const bg = getComputedStyle(cur).backgroundColor;
            const parsed = parseColor(bg);
            const a = parsed[3];
            if (a > 0.001) {
                rAcc += parsed[0] * 255 * a * alphaRem;
                gAcc += parsed[1] * 255 * a * alphaRem;
                bAcc += parsed[2] * 255 * a * alphaRem;
                alphaRem *= (1 - a);
                if (1 - alphaRem >= 0.99)
                    break;
            }
        }
        if (alphaRem > 0.001) {
            rAcc += 255 * alphaRem;
            gAcc += 255 * alphaRem;
            bAcc += 255 * alphaRem;
        }
        return `rgb(${Math.round(rAcc)}, ${Math.round(gAcc)}, ${Math.round(bAcc)})`;
    }
    function colorToCssRgb(color) {
        return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
    }
    function hasComplexBackdropVisual(el) {
        const cs = getComputedStyle(el);
        if (hasComplexBackground(cs))
            return true;
        const before = getComputedStyle(el, '::before');
        const after = getComputedStyle(el, '::after');
        return pseudoHasVisual(before) || pseudoHasVisual(after);
    }
    function sampleRawRgbRegion(bytes, width, height, rx, ry, rw, rh) {
        const x0 = Math.max(0, Math.min(width, Math.round(rx)));
        const y0 = Math.max(0, Math.min(height, Math.round(ry)));
        const x1 = Math.max(0, Math.min(width, Math.round(rx + rw)));
        const y1 = Math.max(0, Math.min(height, Math.round(ry + rh)));
        if (x1 <= x0 || y1 <= y0)
            return null;
        const stepX = Math.max(1, Math.floor((x1 - x0) / 8));
        const stepY = Math.max(1, Math.floor((y1 - y0) / 8));
        const rs = [];
        const gs = [];
        const bs = [];
        for (let y = y0; y < y1; y += stepY) {
            for (let x = x0; x < x1; x += stepX) {
                const idx = (y * width + x) * 3;
                rs.push(bytes[idx]);
                gs.push(bytes[idx + 1]);
                bs.push(bytes[idx + 2]);
            }
        }
        if (rs.length === 0)
            return null;
        rs.sort((a, b) => a - b);
        gs.sort((a, b) => a - b);
        bs.sort((a, b) => a - b);
        const mid = rs.length >> 1;
        const pick = (arr) => (arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2);
        return [pick(rs) / 255, pick(gs) / 255, pick(bs) / 255, 1];
    }
    function cropRawRgbToDataUrl(bytes, width, height, rx, ry, rw, rh) {
        const x0 = Math.max(0, Math.min(width, Math.round(rx)));
        const y0 = Math.max(0, Math.min(height, Math.round(ry)));
        const x1 = Math.max(0, Math.min(width, Math.round(rx + rw)));
        const y1 = Math.max(0, Math.min(height, Math.round(ry + rh)));
        const outW = x1 - x0;
        const outH = y1 - y0;
        if (outW <= 0 || outH <= 0)
            return null;
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return null;
        const imageData = ctx.createImageData(outW, outH);
        for (let y = 0; y < outH; y++) {
            for (let x = 0; x < outW; x++) {
                const srcIdx = ((y + y0) * width + (x + x0)) * 3;
                const dstIdx = (y * outW + x) * 4;
                imageData.data[dstIdx] = bytes[srcIdx];
                imageData.data[dstIdx + 1] = bytes[srcIdx + 1];
                imageData.data[dstIdx + 2] = bytes[srcIdx + 2];
                imageData.data[dstIdx + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
    }
    function copyComputedStyles(target, computed, exclude = new Set()) {
        for (let i = 0; i < computed.length; i++) {
            const prop = computed[i];
            if (exclude.has(prop) || prop === 'content')
                continue;
            const value = computed.getPropertyValue(prop);
            const priority = computed.getPropertyPriority(prop);
            if (value)
                target.style.setProperty(prop, value, priority);
        }
    }
    function buildPseudoClone(owner, pseudo) {
        const computed = getComputedStyle(owner, pseudo);
        if (!pseudoHasVisual(computed))
            return null;
        const pseudoEl = document.createElement('span');
        pseudoEl.setAttribute('data-dom2pdf-pseudo', pseudo);
        copyComputedStyles(pseudoEl, computed);
        if (computed.position === 'sticky') {
            // Pseudo clones are inserted as real inline children. Keeping sticky here makes
            // foreignObject rasterization drift or drop line-number style markers entirely.
            pseudoEl.style.position = 'static';
            pseudoEl.style.top = 'auto';
            pseudoEl.style.right = 'auto';
            pseudoEl.style.bottom = 'auto';
            pseudoEl.style.left = 'auto';
        }
        const text = cssQuotedContentToText(computed.content);
        if (text)
            pseudoEl.textContent = text;
        return pseudoEl;
    }
    // --- ::marker pseudo-element support ---
    //
    // list-item markers (bullets, numbers) are generated by the browser's layout
    // engine as ::marker pseudo-elements. They are not part of the DOM and cannot
    // be captured by cloneNode or CSS property inspection. We synthesize a span
    // carrying the marker text + ::marker computed styles so it can be baked into
    // the raster (full-raster or background-raster) alongside the element's content.
    function listItemIndex(el) {
        const explicit = parseInt(el.getAttribute('value') || '', 10);
        if (!Number.isNaN(explicit))
            return explicit;
        const parent = el.parentElement;
        const startAttr = parent?.tagName.toUpperCase() === 'OL'
            ? parseInt(parent.getAttribute('start') || '1', 10)
            : 1;
        let count = 0;
        for (let sib = parent?.firstElementChild; sib; sib = sib.nextElementSibling) {
            if (sib === el)
                return startAttr + count;
            if (sib.tagName.toUpperCase() === 'LI') {
                const v = parseInt(sib.getAttribute('value') || '', 10);
                count = Number.isNaN(v) ? count + 1 : v;
            }
        }
        return startAttr;
    }
    function toAlpha(n) {
        let s = '';
        while (n > 0) {
            const rem = (n - 1) % 26;
            s = String.fromCharCode(97 + rem) + s;
            n = Math.floor((n - 1) / 26);
        }
        return s;
    }
    function toRoman(n) {
        const table = [
            [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
            [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
            [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'],
            [1, 'I'],
        ];
        let s = '';
        for (const [v, sym] of table) {
            while (n >= v) {
                s += sym;
                n -= v;
            }
        }
        return s;
    }
    function markerTextForListItem(el, cs) {
        const type = (cs.listStyleType || '').trim();
        if (!type || type === 'none')
            return '';
        // Explicit content on ::marker takes precedence
        let markerContent = '';
        try {
            markerContent = getComputedStyle(el, '::marker').content || '';
        }
        catch {
            markerContent = '';
        }
        const explicit = cssQuotedContentToText(markerContent);
        if (explicit)
            return explicit;
        // String list-style-type (e.g. list-style-type: "-")
        if (type.startsWith('"') || type.startsWith("'")) {
            const asString = cssQuotedContentToText(type);
            if (asString)
                return asString;
        }
        switch (type) {
            case 'disc': return '\u2022';
            case 'circle': return '\u25CB';
            case 'square': return '\u25AA';
            case 'disclosure-open': return '\u25BE';
            case 'disclosure-closed': return '\u25B8';
            case 'decimal': return `${listItemIndex(el)}.`;
            case 'decimal-leading-zero': return `${String(listItemIndex(el)).padStart(2, '0')}.`;
            case 'lower-alpha':
            case 'lower-latin': return `${toAlpha(listItemIndex(el))}.`;
            case 'upper-alpha':
            case 'upper-latin': return `${toAlpha(listItemIndex(el)).toUpperCase()}.`;
            case 'lower-roman': return `${toRoman(listItemIndex(el)).toLowerCase()}.`;
            case 'upper-roman': return `${toRoman(listItemIndex(el))}.`;
            default: return '\u2022';
        }
    }
    function buildMarkerClone(owner) {
        const cs = getComputedStyle(owner);
        if (cs.display !== 'list-item')
            return null;
        const type = (cs.listStyleType || '').trim();
        if (!type || type === 'none')
            return null;
        const img = (cs.listStyleImage || '').trim();
        if (img && img !== 'none')
            return null; // image marker - can't clone as text
        const text = markerTextForListItem(owner, cs);
        if (!text)
            return null;
        // ::marker pseudo-element may not be supported in all environments. Fall back
        // to the element's own computed style (color, font, etc. are inherited).
        let markerCs;
        try {
            markerCs = getComputedStyle(owner, '::marker');
        }
        catch {
            markerCs = cs;
        }
        const span = document.createElement('span');
        span.setAttribute('data-dom2pdf-pseudo', '::marker');
        copyComputedStyles(span, markerCs);
        // Ensure the span renders as inline content, not as a marker box
        span.style.display = 'inline';
        span.textContent = text;
        return span;
    }
    function cloneElementForRaster(src) {
        if (src instanceof HTMLCanvasElement) {
            const img = document.createElement('img');
            img.src = src.toDataURL('image/png');
            img.width = src.width;
            img.height = src.height;
            const computed = getComputedStyle(src);
            copyComputedStyles(img, computed);
            return img;
        }
        if (src instanceof HTMLImageElement) {
            const img = document.createElement('img');
            // Use the resolved currentSrc so file:// and srcset-backed images keep working
            // after being serialized into a data: SVG foreignObject wrapper.
            img.src = src.currentSrc || src.src;
            img.width = src.width;
            img.height = src.height;
            const computed = getComputedStyle(src);
            copyComputedStyles(img, computed);
            return img;
        }
        // Inline <svg> elements live in the SVG namespace. When serialized into an
        // HTML <div> inside an SVG <foreignObject>, the namespace context can be lost
        // and the SVG may not render at all (100% blank icon). Convert inline SVG to
        // an <img> with a data: URL so it renders reliably as a raster image.
        if (src instanceof SVGSVGElement) {
            const img = document.createElement('img');
            const svgString = new XMLSerializer().serializeToString(src);
            img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
            const rect = src.getBoundingClientRect();
            img.width = Math.max(1, Math.round(rect.width));
            img.height = Math.max(1, Math.round(rect.height));
            const computed = getComputedStyle(src);
            copyComputedStyles(img, computed);
            return img;
        }
        const clone = src.cloneNode(false);
        const computed = getComputedStyle(src);
        copyComputedStyles(clone, computed);
        const marker = buildMarkerClone(src);
        if (marker) {
            // Suppress the browser's auto-generated marker so only our clone renders.
            clone.style.listStyleType = 'none';
            clone.appendChild(marker);
        }
        const before = buildPseudoClone(src, '::before');
        if (before)
            clone.appendChild(before);
        for (let child = src.firstChild; child; child = child.nextSibling) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                clone.appendChild(cloneElementForRaster(child));
            }
            else if (child.nodeType === Node.TEXT_NODE) {
                clone.appendChild(document.createTextNode(child.data));
            }
        }
        const after = buildPseudoClone(src, '::after');
        if (after)
            clone.appendChild(after);
        return clone;
    }
    // Clone only an element's own background layer: its computed styles + decorative
    // pseudos, with NO real children/text and NO box-shadow. Used to bake a backdrop
    // image that sits under the element's still-vector text. box-shadow is dropped
    // because the box node paints it vectorially (avoids double shadow). Purely
    // decorative ::after overlays (no text content) can also be baked here to avoid
    // unnecessary full-raster fallback for gradient cards / highlight sheens.
    function cloneElementBackgroundOnly(src) {
        const clone = src.cloneNode(false);
        copyComputedStyles(clone, getComputedStyle(src));
        clone.style.boxShadow = 'none';
        const marker = buildMarkerClone(src);
        if (marker) {
            clone.style.listStyleType = 'none';
            clone.appendChild(marker);
        }
        const before = buildPseudoClone(src, '::before');
        if (before)
            clone.appendChild(before);
        const afterComputed = getComputedStyle(src, '::after');
        if (pseudoHasVisual(afterComputed) && !pseudoNeedsForegroundRaster(afterComputed)) {
            const after = buildPseudoClone(src, '::after');
            if (after)
                clone.appendChild(after);
        }
        return clone;
    }
    function loadImageFromUrl(url, crossOrigin) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.decoding = 'async';
            if (crossOrigin)
                img.crossOrigin = crossOrigin;
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('failed to load rasterized element image'));
            img.src = url;
        });
    }
    // raw RGB is uncompressed (3 bytes/px); cap total pixels so a supersampled large
    // element can't blow up memory / PDF size. ~4M px ≈ 12 MB raw.
    const MAX_RASTER_PIXELS = 4000000;
    // Supersample factor for rasterized elements: render the foreignObject into a
    // canvas larger than its CSS box so baked pixels (incl. text that cannot be
    // vectorized) stay crisp. At least 2x; capped at 3x and pulled back to fit the
    // pixel budget.
    function superSampleFactor(cssW, cssH) {
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 2;
        let ss = Math.min(3, Math.max(2, dpr));
        while (ss > 1 && cssW * cssH * ss * ss > MAX_RASTER_PIXELS)
            ss -= 0.5;
        return Math.max(1, ss);
    }
    // Serialize a wrapper (containing the element clone) through an SVG foreignObject
    // into a supersampled canvas, returned as lossless raw RGB.
    async function rasterizeWrapper(wrapper, captureWidth, captureHeight) {
        const serialized = new XMLSerializer().serializeToString(wrapper);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${captureWidth}" height="${captureHeight}" viewBox="0 0 ${captureWidth} ${captureHeight}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div></foreignObject></svg>`;
        const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        const img = await loadImageFromUrl(url);
        const ss = superSampleFactor(captureWidth, captureHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(captureWidth * ss));
        canvas.height = Math.max(1, Math.round(captureHeight * ss));
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return null;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const raw = canvasToRawRgb(canvas);
        if (!raw)
            return null;
        return { bytes: raw.bytes, width: raw.width, height: raw.height, format: IMG_RAW_RGB };
    }
    // Wrapper of fixed CSS size holding the positioned element clone. Opaque backdrop
    // (nearest opaque ancestor bg) fills transparent areas so raw RGB (no alpha)
    // composites correctly instead of going black.
    function buildRasterWrapper(el, rawRect, shadowPad, captureWidth, captureHeight, backgroundOnly, backdropCss, backdropImageUrl) {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.width = `${captureWidth}px`;
        wrapper.style.height = `${captureHeight}px`;
        wrapper.style.overflow = 'hidden';
        wrapper.style.background = backdropCss || findOpaqueBackdropColor(el);
        if (backdropImageUrl) {
            wrapper.style.backgroundImage = `url("${backdropImageUrl}")`;
            wrapper.style.backgroundSize = '100% 100%';
            wrapper.style.backgroundRepeat = 'no-repeat';
            wrapper.style.backgroundPosition = '0 0';
        }
        const clone = backgroundOnly ? cloneElementBackgroundOnly(el) : cloneElementForRaster(el);
        clone.style.position = 'absolute';
        clone.style.left = `${shadowPad.left}px`;
        clone.style.top = `${shadowPad.top}px`;
        clone.style.width = `${Math.max(1, Math.ceil(rawRect.width))}px`;
        clone.style.height = `${Math.max(1, Math.ceil(rawRect.height))}px`;
        clone.style.margin = '0';
        clone.style.transform = 'none';
        clone.style.transformOrigin = 'top left';
        wrapper.appendChild(clone);
        return wrapper;
    }
    async function resolveBackdropImage(el, rawRect) {
        const stats = getDebugPerfState().snapshot;
        const startedAt = performance.now();
        let scanned = 0;
        try {
            for (let cur = el.parentElement; cur; cur = cur.parentElement) {
                scanned += 1;
                if (!hasComplexBackdropVisual(cur))
                    continue;
                const ancestorRect = cur.getBoundingClientRect();
                if (ancestorRect.width <= 0 || ancestorRect.height <= 0)
                    continue;
                const raster = await getCachedBackdropRaster(cur, findOpaqueBackdropColor(cur));
                if (!raster)
                    continue;
                const scaleX = raster.width / Math.max(1, Math.ceil(ancestorRect.width));
                const scaleY = raster.height / Math.max(1, Math.ceil(ancestorRect.height));
                const relX = Math.max(0, rawRect.left - ancestorRect.left);
                const relY = Math.max(0, rawRect.top - ancestorRect.top);
                const dataUrl = cropRawRgbToDataUrl(raster.bytes, raster.width, raster.height, relX * scaleX, relY * scaleY, Math.max(1, rawRect.width * scaleX), Math.max(1, rawRect.height * scaleY));
                if (dataUrl)
                    return dataUrl;
            }
            return null;
        }
        finally {
            stats.resolveBackdropImageCalls += 1;
            stats.resolveBackdropImageMs += performance.now() - startedAt;
            stats.resolveBackdropAncestorScans += scanned;
        }
    }
    async function getCachedBackdropRaster(el, backdropCss) {
        const state = getDebugPerfState();
        const cached = state.backdropRasterCache.get(el);
        if (cached) {
            state.snapshot.rasterBgCacheHits += 1;
            return cached;
        }
        state.snapshot.rasterBgCacheMisses += 1;
        const rect = el.getBoundingClientRect();
        const promise = rect.width <= 0 || rect.height <= 0
            ? Promise.resolve(null)
            : rasterizeElementBackgroundOnly(el, rect, backdropCss, false);
        state.backdropRasterCache.set(el, promise);
        return promise;
    }
    async function resolveBackdropColor(el, rawRect) {
        const stats = getDebugPerfState().snapshot;
        const startedAt = performance.now();
        let scanned = 0;
        try {
            for (let cur = el.parentElement; cur; cur = cur.parentElement) {
                scanned += 1;
                if (!hasComplexBackdropVisual(cur))
                    continue;
                const ancestorRect = cur.getBoundingClientRect();
                if (ancestorRect.width <= 0 || ancestorRect.height <= 0)
                    continue;
                const raster = await getCachedBackdropRaster(cur, findOpaqueBackdropColor(cur));
                if (!raster)
                    continue;
                const scaleX = raster.width / Math.max(1, Math.ceil(ancestorRect.width));
                const scaleY = raster.height / Math.max(1, Math.ceil(ancestorRect.height));
                const relX = Math.max(0, rawRect.left - ancestorRect.left);
                const relY = Math.max(0, rawRect.top - ancestorRect.top);
                const inset = 0.25;
                const sample = sampleRawRgbRegion(raster.bytes, raster.width, raster.height, (relX + rawRect.width * inset) * scaleX, (relY + rawRect.height * inset) * scaleY, Math.max(1, rawRect.width * (1 - inset * 2) * scaleX), Math.max(1, rawRect.height * (1 - inset * 2) * scaleY));
                if (sample)
                    return sample;
            }
            return parseColor(findOpaqueBackdropColor(el));
        }
        finally {
            stats.resolveBackdropColorCalls += 1;
            stats.resolveBackdropColorMs += performance.now() - startedAt;
            stats.resolveBackdropAncestorScans += scanned;
        }
    }
    async function rasterizeElement(el, rawRect, _quality, cs) {
        const stats = getDebugPerfState().snapshot;
        const startedAt = performance.now();
        try {
            const shadowPad = computeBoxShadowPadding(cs.boxShadow);
            const captureWidth = Math.max(1, Math.ceil(rawRect.width + shadowPad.left + shadowPad.right));
            const captureHeight = Math.max(1, Math.ceil(rawRect.height + shadowPad.top + shadowPad.bottom));
            const backdropFilter = (cs.getPropertyValue('backdrop-filter') || cs.getPropertyValue('-webkit-backdrop-filter') || '').trim();
            const bg = parseColor(cs.backgroundColor);
            const needsBackdropColorSample = bg[3] > 0.001 && bg[3] < 1;
            const backdropCss = needsBackdropColorSample
                ? colorToCssRgb(await resolveBackdropColor(el, rawRect))
                : findOpaqueBackdropColor(el);
            const backdropImageUrl = backdropFilter && backdropFilter !== 'none'
                ? await resolveBackdropImage(el, rawRect)
                : null;
            const wrapper = buildRasterWrapper(el, rawRect, shadowPad, captureWidth, captureHeight, false, backdropCss, backdropImageUrl ?? undefined);
            const out = await rasterizeWrapper(wrapper, captureWidth, captureHeight);
            if (!out)
                return null;
            return {
                ...out,
                // Layout (CSS px) size is independent of the supersampled pixel count — the
                // engine draws the image into the layout box; pixels only set resolution.
                cssWidth: captureWidth,
                cssHeight: captureHeight,
                rawLeft: rawRect.left - shadowPad.left,
                rawTop: rawRect.top - shadowPad.top,
            };
        }
        catch {
            return null;
        }
        finally {
            stats.rasterFullCalls += 1;
            stats.rasterFullMs += performance.now() - startedAt;
        }
    }
    // Background-only raster: bakes just the element's own background + ::before
    // decoration (no real text/children, no box-shadow) so text stays vector. The
    // backdrop node uses objectFit:0, so pixel count is decoupled from layout size —
    // no cssWidth round-trip needed.
    async function rasterizeElementBackgroundOnly(el, rawRect, backdropCss, allowBackdropSampling = true) {
        const stats = getDebugPerfState().snapshot;
        const startedAt = performance.now();
        stats.rasterBgCalls += 1;
        stats.rasterBgDepth += 1;
        stats.rasterBgMaxDepth = Math.max(stats.rasterBgMaxDepth, stats.rasterBgDepth);
        try {
            // No shadow padding: box-shadow is painted vectorially by the box node.
            const captureWidth = Math.max(1, Math.ceil(rawRect.width));
            const captureHeight = Math.max(1, Math.ceil(rawRect.height));
            const noPad = { top: 0, right: 0, bottom: 0, left: 0 };
            const resolvedBackdrop = backdropCss
                || (allowBackdropSampling
                    ? colorToCssRgb(await resolveBackdropColor(el, rawRect))
                    : findOpaqueBackdropColor(el));
            const backdropImageUrl = allowBackdropSampling
                ? await resolveBackdropImage(el, rawRect)
                : null;
            const wrapper = buildRasterWrapper(el, rawRect, noPad, captureWidth, captureHeight, true, resolvedBackdrop, backdropImageUrl ?? undefined);
            return await rasterizeWrapper(wrapper, captureWidth, captureHeight);
        }
        catch {
            return null;
        }
        finally {
            stats.rasterBgDepth -= 1;
            stats.rasterBgMs += performance.now() - startedAt;
        }
    }
    // Inline <svg> elements live in the SVG namespace, so their `tagName` keeps its
    // original case ("svg") instead of being upper-cased like HTML tags. Compare
    // case-insensitively or these icons silently skip rasterization and vanish.
    //
    // Native form controls (checkbox, radio) are replaced elements whose visual
    // appearance (checkmark, fill state, native border) comes from the browser's
    // widget rendering, not from CSS. They must be baked to an image so the PDF
    // shows what the browser shows. appearance:none means the author replaced the
    // native widget with custom CSS, so treat it as an ordinary element.
    function isRasterTag(el, cs) {
        const tag = el.tagName.toUpperCase();
        if (tag === 'SVG' || tag === 'CANVAS')
            return true;
        if (tag === 'INPUT') {
            const type = (el.getAttribute('type') || 'text').toLowerCase();
            if (type === 'checkbox' || type === 'radio') {
                const appearance = (cs.appearance || cs.webkitAppearance || '').trim();
                return appearance !== 'none';
            }
        }
        return false;
    }
    // True when `transform` is a pure translation (no rotate/scale/skew). Such an
    // element needs no rasterization at all: getBoundingClientRect (and every
    // descendant's) already reflects the translated position, so vector text lands
    // correctly. getComputedStyle normalizes transform to matrix()/matrix3d(), so
    // those are the primary paths; the function-form check is a defensive fallback.
    function transformIsPureTranslate(cs) {
        const t = (cs.transform || '').trim();
        if (t === '' || t === 'none')
            return true;
        const EPS = 1e-3;
        const near = (a, b) => Math.abs(a - b) < EPS;
        const m2 = /^matrix\(([^)]+)\)$/.exec(t);
        if (m2) {
            const n = m2[1].split(',').map((s) => parseFloat(s));
            return n.length === 6 && near(n[0], 1) && near(n[1], 0) && near(n[2], 0) && near(n[3], 1);
        }
        const m3 = /^matrix3d\(([^)]+)\)$/.exec(t);
        if (m3) {
            const n = m3[1].split(',').map((s) => parseFloat(s));
            // Linear part (excluding the tx,ty,tz column n[12..14]) must be identity.
            return n.length === 16
                && near(n[0], 1) && near(n[1], 0) && near(n[2], 0) && near(n[3], 0)
                && near(n[4], 0) && near(n[5], 1) && near(n[6], 0) && near(n[7], 0)
                && near(n[8], 0) && near(n[9], 0) && near(n[10], 1) && near(n[11], 0)
                && near(n[15], 1);
        }
        return /^(translate|translateX|translateY|translateZ|translate3d)\(/.test(t)
            && !/(rotate|scale|skew|matrix|perspective)/.test(t);
    }
    function classifyRenderStrategy(el, cs) {
        const mode = el.dataset.dom2pdfMode;
        if (mode === 'vector' || mode === 'skip')
            return 'vector';
        if (isRasterTag(el, cs))
            return 'full-raster';
        const backdropFilter = (cs.getPropertyValue('backdrop-filter') || cs.getPropertyValue('-webkit-backdrop-filter') || '').trim();
        if (backdropFilter && backdropFilter !== 'none')
            return 'full-raster';
        if (el.tagName === 'CODE') {
            const bg = parseColor(cs.backgroundColor);
            const hasRadius = (parseFloat(cs.borderTopLeftRadius) || 0)
                + (parseFloat(cs.borderTopRightRadius) || 0)
                + (parseFloat(cs.borderBottomRightRadius) || 0)
                + (parseFloat(cs.borderBottomLeftRadius) || 0);
            if (bg[3] > 0.001 || hasRadius > 0) {
                // Inline code chips are tiny and visually sensitive to exact browser
                // painting (background fill, corner clipping, font AA). Rasterizing the
                // chip preserves that appearance while hidden text fallback keeps them
                // extractable in the PDF text layer.
                return 'full-raster';
            }
        }
        const clipsText = cs.backgroundImage !== 'none'
            && ((cs.backgroundClip || '').trim() === 'text'
                || (cs.webkitBackgroundClip || '').trim() === 'text');
        const transparentTextFill = (cs.webkitTextFillColor || '').trim() === 'rgba(0, 0, 0, 0)'
            || (cs.getPropertyValue('-webkit-text-fill-color') || '').trim() === 'rgba(0, 0, 0, 0)';
        if (clipsText || transparentTextFill)
            return 'full-raster';
        // Non-translate transforms skew/scale/rotate the text — must check before the
        // background branch so e.g. "rotate + gradient" doesn't try to keep text vector.
        if (!transformIsPureTranslate(cs))
            return 'full-raster';
        const afterPseudo = getComputedStyle(el, '::after');
        // Textual ::after content must stay in the foreground paint order, so keep the
        // old full-raster fallback for those cases. Decorative overlays can be baked
        // into the backdrop image while real text remains vector.
        if (pseudoHasVisual(afterPseudo) && pseudoNeedsForegroundRaster(afterPseudo))
            return 'full-raster';
        const beforeVisual = pseudoHasVisual(getComputedStyle(el, '::before'));
        if (beforeVisual || hasComplexBackground(cs))
            return 'background-raster';
        return 'vector';
    }
    function collectFullRasterExtractableText(root) {
        const parts = [];
        const append = (value) => {
            if (!value)
                return;
            parts.push(value);
        };
        const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                append(node.data);
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE)
                return;
            const el = node;
            append(cssQuotedContentToText(getComputedStyle(el, '::before').content));
            for (let child = el.firstChild; child; child = child.nextSibling) {
                walk(child);
            }
            append(cssQuotedContentToText(getComputedStyle(el, '::after').content));
        };
        walk(root);
        return parts
            .join('')
            .replace(/\s*\n\s*/g, ' ')
            .replace(/[ \t\f\r]+/g, ' ')
            .trim();
    }
    function gradientAngleDeg(token) {
        const v = token.trim().toLowerCase();
        const deg = /^([+-]?\d+(?:\.\d+)?)deg$/.exec(v);
        if (deg)
            return parseFloat(deg[1]);
        switch (v) {
            case 'to top': return 0;
            case 'to right': return 90;
            case 'to bottom': return 180;
            case 'to left': return 270;
            case 'to top right':
            case 'to right top': return 45;
            case 'to bottom right':
            case 'to right bottom': return 135;
            case 'to bottom left':
            case 'to left bottom': return 225;
            case 'to top left':
            case 'to left top': return 315;
            default: return null;
        }
    }
    function rgbaCss(c) {
        return `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${c[3]})`;
    }
    function parseGradientStop(part) {
        const m = /^(.*?)(?:\s+([+-]?\d+(?:\.\d+)?)(px|%)?)?$/.exec(part.trim());
        if (!m)
            return null;
        const colorText = m[1].trim();
        if (!colorText)
            return null;
        return {
            color: parseColor(colorText),
            pos: m[2] == null ? null : parseFloat(m[2]),
            unit: m[2] == null ? null : ((m[3] === '%') ? '%' : 'px'),
        };
    }
    function resolveGradientStops(rawStops, total) {
        const out = rawStops.map((stop) => ({
            color: stop.color,
            pos: stop.pos == null ? null : (stop.unit === '%' ? (stop.pos / 100) * total : stop.pos),
        }));
        if (out.length < 2)
            return [];
        if (out[0].pos == null)
            out[0].pos = 0;
        if (out[out.length - 1].pos == null)
            out[out.length - 1].pos = total;
        for (let i = 0; i < out.length; i++) {
            if (out[i].pos != null)
                continue;
            let j = i + 1;
            while (j < out.length && out[j].pos == null)
                j++;
            const left = out[i - 1].pos ?? 0;
            const right = j < out.length ? (out[j].pos ?? total) : total;
            const span = j - i + 1;
            for (let k = i; k < j; k++) {
                out[k].pos = left + ((right - left) * (k - i + 1)) / span;
            }
            i = j - 1;
        }
        return out.map((stop) => ({ color: stop.color, pos: stop.pos ?? 0 }));
    }
    function parseAnchorToken(token, total, isX) {
        const v = token.trim().toLowerCase();
        if (!v || v === 'center')
            return total / 2;
        if ((isX && v === 'left') || (!isX && v === 'top'))
            return 0;
        if ((isX && v === 'right') || (!isX && v === 'bottom'))
            return total;
        const m = /^([+-]?\d+(?:\.\d+)?)%$/.exec(v);
        if (m)
            return (parseFloat(m[1]) / 100) * total;
        return total / 2;
    }
    function radiusFromMode(mode, cx, cy, w, h) {
        const corners = [
            Math.hypot(cx, cy),
            Math.hypot(w - cx, cy),
            Math.hypot(cx, h - cy),
            Math.hypot(w - cx, h - cy),
        ];
        switch (mode) {
            case 'closest-side':
                return Math.max(1, Math.min(cx, w - cx, cy, h - cy));
            case 'farthest-side':
                return Math.max(1, Math.max(cx, w - cx, cy, h - cy));
            case 'closest-corner':
                return Math.max(1, Math.min(...corners));
            default:
                return Math.max(1, Math.max(...corners));
        }
    }
    function parseLinearOrRepeatingLinearGradient(input) {
        const src = input.trim();
        const repeating = src.startsWith('repeating-linear-gradient(');
        const prefix = repeating ? 'repeating-linear-gradient(' : 'linear-gradient(';
        if (!src.startsWith(prefix) || !src.endsWith(')'))
            return null;
        const inner = src.slice(prefix.length, -1).trim();
        const parts = splitTopLevelComma(inner);
        if (parts.length < 2)
            return null;
        let angleDeg = 180;
        let stopStart = 0;
        const maybeAngle = gradientAngleDeg(parts[0]);
        if (maybeAngle !== null) {
            angleDeg = maybeAngle;
            stopStart = 1;
        }
        const stops = parts.slice(stopStart).map(parseGradientStop).filter((v) => !!v);
        if (stops.length < 2)
            return null;
        return { kind: 'linear', repeating, angleDeg, stops };
    }
    function parseRadialGradient(input, width, height) {
        const src = input.trim();
        const repeating = src.startsWith('repeating-radial-gradient(');
        const prefix = repeating ? 'repeating-radial-gradient(' : 'radial-gradient(';
        if (!src.startsWith(prefix) || !src.endsWith(')'))
            return null;
        const inner = src.slice(prefix.length, -1).trim();
        const parts = splitTopLevelComma(inner);
        if (parts.length < 2)
            return null;
        let descriptor = '';
        let stopStart = 0;
        if (parts[0].includes('circle') || parts[0].includes('ellipse') || parts[0].includes('closest') || parts[0].includes('farthest') || parts[0].includes(' at ')) {
            descriptor = parts[0].trim().toLowerCase();
            stopStart = 1;
        }
        const stops = parts.slice(stopStart).map(parseGradientStop).filter((v) => !!v);
        if (stops.length < 2)
            return null;
        let centerX = width / 2;
        let centerY = height / 2;
        let sizeMode = 'farthest-corner';
        if (descriptor) {
            if (descriptor.includes('closest-side'))
                sizeMode = 'closest-side';
            else if (descriptor.includes('closest-corner'))
                sizeMode = 'closest-corner';
            else if (descriptor.includes('farthest-side'))
                sizeMode = 'farthest-side';
            if (descriptor.includes(' at ')) {
                const at = descriptor.split(' at ')[1].trim();
                const tokens = at.split(/\s+/).filter(Boolean);
                const xTok = tokens[0] ?? 'center';
                const yTok = tokens[1] ?? (tokens[0] === 'top' || tokens[0] === 'bottom' ? tokens[0] : 'center');
                centerX = parseAnchorToken(xTok, width, true);
                centerY = parseAnchorToken(yTok, height, false);
            }
        }
        return {
            kind: 'radial',
            repeating,
            centerX,
            centerY,
            radius: radiusFromMode(sizeMode, centerX, centerY, width, height),
            stops,
        };
    }
    function blendOver(bottom, top) {
        const a = top[3] + bottom[3] * (1 - top[3]);
        if (a <= 0.0001)
            return [0, 0, 0, 0];
        const r = (top[0] * top[3] + bottom[0] * bottom[3] * (1 - top[3])) / a;
        const g = (top[1] * top[3] + bottom[1] * bottom[3] * (1 - top[3])) / a;
        const b = (top[2] * top[3] + bottom[2] * bottom[3] * (1 - top[3])) / a;
        return [r, g, b, a];
    }
    function mixColor(a, b, t) {
        const s = Math.min(1, Math.max(0, t));
        return [
            a[0] + (b[0] - a[0]) * s,
            a[1] + (b[1] - a[1]) * s,
            a[2] + (b[2] - a[2]) * s,
            a[3] + (b[3] - a[3]) * s,
        ];
    }
    function sampleGradientStops(stops, t, repeating) {
        if (stops.length === 0)
            return [1, 1, 1, 1];
        let pos = t;
        if (repeating) {
            const start = stops[0].pos;
            const end = stops[stops.length - 1].pos;
            const span = end - start;
            if (span > 0.0001) {
                pos = ((pos - start) % span + span) % span + start;
            }
        }
        if (pos <= stops[0].pos)
            return stops[0].color;
        if (pos >= stops[stops.length - 1].pos)
            return stops[stops.length - 1].color;
        for (let i = 1; i < stops.length; i++) {
            if (pos > stops[i].pos)
                continue;
            const left = stops[i - 1];
            const right = stops[i];
            const span = right.pos - left.pos;
            const ratio = span <= 0.0001 ? 0 : (pos - left.pos) / span;
            return mixColor(left.color, right.color, ratio);
        }
        return stops[stops.length - 1].color;
    }
    function parseGradientLayer(layerText, width, height) {
        const text = layerText.trim();
        if (!text || text === 'none')
            return null;
        const linearSpec = parseLinearOrRepeatingLinearGradient(text);
        if (linearSpec) {
            const rad = (linearSpec.angleDeg * Math.PI) / 180;
            const dx = Math.sin(rad);
            const dy = -Math.cos(rad);
            const lineLen = Math.max(1, Math.abs(dx) * width + Math.abs(dy) * height);
            return {
                kind: 'linear',
                repeating: linearSpec.repeating,
                stops: resolveGradientStops(linearSpec.stops, lineLen),
                dx,
                dy,
                lineLen,
                cx: width / 2,
                cy: height / 2,
            };
        }
        const radialSpec = parseRadialGradient(text, width, height);
        if (radialSpec) {
            return {
                kind: 'radial',
                repeating: radialSpec.repeating,
                stops: resolveGradientStops(radialSpec.stops, radialSpec.radius),
                centerX: radialSpec.centerX,
                centerY: radialSpec.centerY,
            };
        }
        return null;
    }
    function sampleGradientLayer(layer, x, y) {
        if (layer.kind === 'linear') {
            return sampleGradientStops(layer.stops, (x + 0.5 - layer.cx) * layer.dx + (y + 0.5 - layer.cy) * layer.dy + layer.lineLen / 2, layer.repeating);
        }
        return sampleGradientStops(layer.stops, Math.hypot(x + 0.5 - layer.centerX, y + 0.5 - layer.centerY), layer.repeating);
    }
    function convertBackgroundImageToImage(backgroundImageText, width, height, _quality, fallbackBg) {
        const text = (backgroundImageText || '').trim();
        if (!text || text === 'none')
            return null;
        const w = Math.max(1, Math.round(width));
        const h = Math.max(1, Math.round(height));
        const layers = splitTopLevelComma(text)
            .map((layer) => parseGradientLayer(layer, w, h))
            .filter((layer) => !!layer);
        if (layers.length === 0)
            return null;
        const rgb = new Uint8Array(w * h * 3);
        const base = blendOver([1, 1, 1, 1], fallbackBg ?? [1, 1, 1, 1]);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 3;
                let out = base;
                for (let i = layers.length - 1; i >= 0; i--) {
                    out = blendOver(out, sampleGradientLayer(layers[i], x, y));
                }
                rgb[idx] = Math.round(out[0] * 255);
                rgb[idx + 1] = Math.round(out[1] * 255);
                rgb[idx + 2] = Math.round(out[2] * 255);
            }
        }
        return { bytes: rgb, width: w, height: h, format: IMG_RAW_RGB };
    }
    function resolveHFSlotPosition(position) {
        if (Array.isArray(position)) {
            return {
                position: 9,
                custom: position,
                customPosition: null,
            };
        }
        if (isHFCoordinatePosition(position)) {
            const x = parseHFCoordinateValue(position.x) ?? { pct: 0, offsetPx: 0 };
            const y = parseHFCoordinateValue(position.y) ?? { pct: 0, offsetPx: 0 };
            return {
                position: 10,
                custom: null,
                customPosition: {
                    xPct: x.pct,
                    xOffsetPx: x.offsetPx,
                    yPct: y.pct,
                    yOffsetPx: y.offsetPx,
                    anchor: positionNum(position.anchor ?? 'leftTop'),
                },
            };
        }
        return {
            position: positionNum(isHFSemanticPosition(position) ? position : undefined),
            custom: null,
            customPosition: null,
        };
    }
    function resolveHFSlot(slot, region, fallbackPosition) {
        const position = resolveHFSlotPosition(slot.position ?? fallbackPosition);
        return {
            content: slot.content,
            color: parseColor(slot.color ?? region.contentColor ?? '#333333'),
            fontFamily: slot.fontFamily?.trim() || 'Helvetica',
            fontSizePx: slot.fontSize ?? region.contentFontSize ?? 16,
            fontWeight: Math.max(1, Math.round(slot.fontWeight ?? 400)),
            italic: slot.italic ? 1 : 0,
            position: position.position,
            custom: position.custom,
            customPosition: position.customPosition,
        };
    }
    function resolveRegion(region, isFooter) {
        if (!region)
            return null;
        const slots = Array.isArray(region.slots)
            ? region.slots.map((slot) => resolveHFSlot(slot, region, region.contentPosition))
            : [];
        if (slots.length === 0) {
            const content = typeof region.content === 'string' ? region.content
                : isFooter ? '${currentPage}/${totalPages}'
                    : '';
            if (content) {
                slots.push(resolveHFSlot({ content }, region, region.contentPosition));
            }
        }
        return {
            heightPx: region.height ?? 50,
            padding: region.padding ?? [0, 24, 0, 24],
            slots,
        };
    }
    function resolvePlaceholder(content, page, total) {
        return content
            .replace(/\$\{currentPage\}/g, String(page + 1))
            .replace(/\$\{totalPages\}/g, String(total));
    }
    function clampResolvedNumber(value, min, max, fallback) {
        if (!Number.isFinite(value))
            return fallback;
        return Math.min(max, Math.max(min, value));
    }
    function isTextWatermark(watermark) {
        return typeof watermark.text === 'string';
    }
    function isResolvedTextWatermark(watermark) {
        return watermark.kind === 0;
    }
    async function collectWatermarkImageAsset(imageUrl, images, cache) {
        const url = imageUrl.trim();
        if (!url)
            return null;
        const cached = cache.get(url);
        if (cached)
            return cached;
        try {
            let img;
            try {
                img = await loadImageFromUrl(url, 'anonymous');
            }
            catch {
                img = await loadImageFromUrl(url);
            }
            if (!img.complete || img.naturalWidth === 0) {
                await img.decode().catch(() => null);
            }
            const width = Math.max(1, Math.round(img.naturalWidth || img.width || 0));
            const height = Math.max(1, Math.round(img.naturalHeight || img.height || 0));
            if (!width || !height)
                return null;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx)
                return null;
            ctx.drawImage(img, 0, 0, width, height);
            const rgba = canvasToRawRgba(canvas);
            if (!rgba)
                return null;
            const imageId = images.length + 1;
            images.push({
                id: imageId,
                bytes: rgba.bytes,
                width: rgba.width,
                height: rgba.height,
                format: IMG_RAW_RGBA,
            });
            const asset = { imageId, width, height };
            cache.set(url, asset);
            return asset;
        }
        catch {
            return null;
        }
    }
    async function resolveWatermark(watermark, images = [], imageCache = new Map()) {
        if (!watermark)
            return null;
        const base = {
            angleDeg: clampResolvedNumber(watermark.angle, -180, 180, 35),
            spacing: watermark.spacing ?? [160, 120],
            offset: watermark.offset ?? [36, 36],
            layer: watermark.layer === 'over' ? 1 : 0,
        };
        if (isTextWatermark(watermark)) {
            const text = watermark.text;
            if (!text.trim())
                return null;
            return {
                kind: 0,
                text,
                color: parseColor(watermark.color ?? 'rgba(0, 0, 0, 0.12)'),
                fontFamily: watermark.fontFamily?.trim() || 'Helvetica',
                fontSizePx: watermark.fontSize ?? 28,
                fontWeight: watermark.fontWeight ?? 400,
                italic: watermark.italic ? 1 : 0,
                ...base,
            };
        }
        const asset = await collectWatermarkImageAsset(watermark.imageUrl, images, imageCache);
        if (!asset)
            return null;
        const imageWidthPx = watermark.imageWidth
            ?? (watermark.imageHeight ? (asset.width * watermark.imageHeight) / asset.height : asset.width);
        const imageHeightPx = watermark.imageHeight
            ?? (watermark.imageWidth ? (asset.height * watermark.imageWidth) / asset.width : asset.height);
        return {
            kind: 1,
            imageId: asset.imageId,
            imageWidthPx: clampResolvedNumber(imageWidthPx, 1, 4096, asset.width),
            imageHeightPx: clampResolvedNumber(imageHeightPx, 1, 4096, asset.height),
            opacity: clampResolvedNumber(watermark.opacity, 0, 1, 0.12),
            ...base,
        };
    }
    async function collectSnapshot(root, options = {}) {
        const data = await collectSnapshotData(root, options);
        return encodeSnapshot(data, []);
    }
    /** Collect the DOM walk into an intermediate form (no per-page HF yet). */
    async function collectSnapshotData(root, options = {}) {
        resetDebugPerfSnapshotState();
        const normalizedOptions = normalizeLegacyOptions(options);
        // jsPDF hooks: accepted but no-op (engine has no jsPDF instance).
        if (normalizedOptions.onJspdfReady) {
            console.warn('dom2pdf: onJspdfReady is accepted but not implemented (no jsPDF engine).');
        }
        if (normalizedOptions.onJspdfFinish) {
            console.warn('dom2pdf: onJspdfFinish is accepted but not implemented (no jsPDF engine).');
        }
        const [fmtW, fmtH] = resolvePageSize(normalizedOptions.format);
        const pageWidthPt = normalizedOptions.pageWidthPt ?? fmtW;
        const pageHeightPt = normalizedOptions.pageHeightPt ?? fmtH;
        const m = normalizedOptions.marginPt ?? 0;
        const [mTop, mRight, mBottom, mLeft] = Array.isArray(m) ? m : [m, m, m, m];
        const quality = normalizedOptions.jpegQuality ?? 0.85;
        const useCORS = normalizedOptions.useCORS ?? false;
        const pagination = normalizedOptions.pagination ?? false;
        const precision = (normalizedOptions.precision ?? 2) | 0;
        const compress = normalizedOptions.compress ?? false;
        // Metadata: normalize user options, fill defaults (WASM has no clock, so
        // dates are generated here on the JS side).
        const metadata = normalizeMetadataOptions(normalizedOptions.metadata);
        if (metadata) {
            if (metadata.producer === '')
                metadata.producer = 'dompdf.js';
            const now = pdfDateString(new Date());
            metadata.creationDate = now;
            metadata.modDate = now;
        }
        const ignoreElements = normalizedOptions.ignoreElements;
        // Fonts
        const fontConfigs = normalizedOptions.fontConfig ?? [];
        const fonts = [];
        for (const fc of fontConfigs) {
            let bytes = fc.fontBytes;
            if (!bytes && fc.fontBase64)
                bytes = base64ToBytes(fc.fontBase64);
            if (!bytes || bytes.length === 0)
                continue;
            fonts.push({
                family: fc.fontFamily,
                style: fc.fontStyle === 'italic' ? 1 : 0,
                weight: fc.fontWeight ?? 400,
                iconFont: fc.iconFont ?? false,
                bytes,
            });
        }
        // pageConfig: object form -> static HF (Rust resolves placeholders).
        //            function form -> per-page resolved text (JS resolves placeholders),
        //            needs totalPages via count_pages (handled by caller in index.ts).
        //            undefined/null + pagination -> library default (page-number footer).
        const staticHF = resolveStaticHF(normalizedOptions, pagination);
        // Pre-collect images.
        const imgElements = Array.from(root.querySelectorAll('img'))
            .filter((img) => !(ignoreElements && ignoreElements(img)));
        const images = [];
        const imgToId = new Map();
        // convertImage rasterizes pixels from a detached, independently-loaded clone
        // (needed for CORS reload), so its success says nothing about this *live*
        // element's own layout state. The tree walk below reads each image node's
        // box from a *separate*, later getBoundingClientRect() call — on a page
        // with lazy/virtualized images (src added/removed as they scroll in and
        // out of range), that box can legitimately shrink to 0x0 in the gap
        // between the two reads, even though it was non-zero right here. Freeze
        // the box now, at the same instant the pixels are captured, and hand it to
        // the tree walk instead of re-measuring later.
        const imgRectAtConvert = new Map();
        await Promise.all(imgElements.map(async (img) => {
            // Capture synchronously, before the async pixel conversion below —
            // not after — so a virtualization/lazy-unload that happens *during*
            // that await can't shrink the box out from under us.
            imgRectAtConvert.set(img, img.getBoundingClientRect());
            const conv = await convertImage(img, quality, useCORS);
            if (!conv) {
                imgRectAtConvert.delete(img);
                return;
            }
            const id = images.length + 1;
            images.push({ id, ...conv });
            imgToId.set(img, id);
        }));
        const rootRect = root.getBoundingClientRect();
        const offX = rootRect.left + window.scrollX;
        const offY = rootRect.top + window.scrollY;
        const layoutScale = computeLayoutScale(rootRect.width, pageWidthPt, mLeft, mRight);
        const nodes = [];
        const formFields = [];
        const range = document.createRange();
        function docRect(r) {
            return {
                x: (r.left + window.scrollX - offX) * layoutScale,
                y: (r.top + window.scrollY - offY) * layoutScale,
                w: r.width * layoutScale,
                h: r.height * layoutScale,
            };
        }
        function charTop(textNode, i) {
            if (i >= textNode.data.length)
                return Infinity;
            range.setStart(textNode, i);
            range.setEnd(textNode, Math.min(i + 1, textNode.data.length));
            const r = range.getBoundingClientRect();
            return r.top || 0;
        }
        function lowerBoundTop(textNode, target, lo, hi) {
            let l = lo;
            let r = hi;
            while (l < r) {
                const mid = (l + r) >> 1;
                if (charTop(textNode, mid) < target)
                    l = mid + 1;
                else
                    r = mid;
            }
            return l;
        }
        function collectTextFragments(textNode, start16 = 0, end16 = textNode.data.length) {
            const text = textNode.data;
            if (!text || start16 >= end16)
                return [];
            range.setStart(textNode, start16);
            range.setEnd(textNode, end16);
            let rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
            if (rects.length === 0)
                return [];
            rects = rects.slice().sort((a, b) => a.top - b.top || a.left - b.left);
            const groups = [];
            for (let i = 0; i < rects.length; i++) {
                const r = rects[i];
                if (groups.length === 0 || Math.abs(r.top - groups[groups.length - 1].top) >= 1) {
                    groups.push(new DOMRect(r.left, r.top, r.width, r.height));
                }
                else {
                    const g = groups[groups.length - 1];
                    const left = Math.min(g.left, r.left);
                    const top = Math.min(g.top, r.top);
                    const right = Math.max(g.right, r.right);
                    const bottom = Math.max(g.bottom, r.bottom);
                    groups[groups.length - 1] = new DOMRect(left, top, right - left, bottom - top);
                }
            }
            if (groups.length === 1) {
                const d = docRect(groups[0]);
                return [{
                        rawRect: groups[0],
                        x: d.x,
                        y: d.y,
                        w: d.w,
                        h: d.h,
                        start16,
                        end16,
                    }];
            }
            const lines = [];
            let prev = start16;
            for (let li = 0; li < groups.length; li++) {
                const raw = groups[li];
                const lineStart16 = lowerBoundTop(textNode, raw.top - 1, prev, end16);
                const nextTop = li + 1 < groups.length ? groups[li + 1].top : Infinity;
                const lineEnd16 = lowerBoundTop(textNode, nextTop - 1, lineStart16, end16);
                prev = lineEnd16;
                if (lineEnd16 <= lineStart16)
                    continue;
                const d = docRect(raw);
                lines.push({
                    rawRect: raw,
                    x: d.x,
                    y: d.y,
                    w: d.w,
                    h: d.h,
                    start16: lineStart16,
                    end16: Math.min(lineEnd16, end16),
                });
            }
            return lines;
        }
        function linesFromFragments(text, baseStart16, fragments) {
            const off = utf8Offsets(text);
            return fragments.map((frag) => ({
                x: frag.x,
                y: frag.y,
                w: frag.w,
                h: frag.h,
                start: off[Math.max(0, frag.start16 - baseStart16)],
                end: off[Math.max(0, Math.min(text.length, frag.end16 - baseStart16))],
            }));
        }
        function collectTextLines(textNode, start16 = 0, end16 = textNode.data.length) {
            const text = textNode.data.slice(start16, end16);
            if (!text)
                return [];
            return linesFromFragments(text, start16, collectTextFragments(textNode, start16, end16));
        }
        function findFirstTextFragmentX(el) {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            while (node) {
                if (node.data && node.data.trim().length > 0) {
                    const fragments = collectTextFragments(node);
                    if (fragments.length > 0)
                        return fragments[0].x;
                }
                node = walker.nextNode();
            }
            return null;
        }
        function buildInlineRuns(text) {
            const graphemes = segmentGraphemes(text);
            if (graphemes.length === 0)
                return [];
            const runs = [];
            let currentKind = graphemeNeedsBitmapFallback(graphemes[0].text) ? 'bitmap' : 'text';
            let start16 = graphemes[0].start16;
            let end16 = graphemes[0].end16;
            for (let i = 1; i < graphemes.length; i++) {
                const segment = graphemes[i];
                const kind = graphemeNeedsBitmapFallback(segment.text) ? 'bitmap' : 'text';
                if (kind === currentKind) {
                    end16 = segment.end16;
                }
                else {
                    runs.push({ kind: currentKind, text: text.slice(start16, end16), start16, end16 });
                    currentKind = kind;
                    start16 = segment.start16;
                    end16 = segment.end16;
                }
            }
            runs.push({ kind: currentKind, text: text.slice(start16, end16), start16, end16 });
            return runs;
        }
        function isCodePointInRange(codePoint, ranges) {
            return ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
        }
        function pickLangFontOverride(grapheme, computedStyle, langFontConfigs) {
            if (!langFontConfigs || langFontConfigs.length === 0)
                return undefined;
            const codePoint = grapheme.codePointAt(0);
            if (codePoint == null)
                return undefined;
            const targetWeight = normalizeLegacyFontWeight(weightNum(computedStyle.fontWeight));
            const targetStyle = normalizeLegacyFontStyle(computedStyle.fontStyle);
            const candidates = langFontConfigs.filter((fontConfig) => (normalizeLegacyFontWeight(fontConfig.fontWeight) === targetWeight
                && normalizeLegacyFontStyle(fontConfig.fontStyle) === targetStyle));
            if (candidates.length === 0) {
                return {
                    family: 'Helvetica',
                    italic: targetStyle === 'italic' ? 1 : 0,
                    weight: targetWeight,
                };
            }
            let defaultFont = null;
            for (const candidate of candidates) {
                if (candidate.charRange && isCodePointInRange(codePoint, candidate.charRange)) {
                    return {
                        family: candidate.fontFamily,
                        italic: targetStyle === 'italic' ? 1 : 0,
                        weight: targetWeight,
                    };
                }
                if (candidate.isDefault && !defaultFont) {
                    defaultFont = candidate;
                }
            }
            if (defaultFont) {
                return {
                    family: defaultFont.fontFamily,
                    italic: targetStyle === 'italic' ? 1 : 0,
                    weight: targetWeight,
                };
            }
            return {
                family: 'Helvetica',
                italic: targetStyle === 'italic' ? 1 : 0,
                weight: targetWeight,
            };
        }
        function fontOverrideKey(fontOverride) {
            if (!fontOverride)
                return '';
            return `${fontOverride.family}|${fontOverride.weight}|${fontOverride.italic}`;
        }
        function buildInlineRunsWithLangFont(text, computedStyle, langFontConfigs) {
            const graphemes = segmentGraphemes(text);
            if (graphemes.length === 0)
                return [];
            const runs = [];
            let currentKind = graphemeNeedsBitmapFallback(graphemes[0].text) ? 'bitmap' : 'text';
            let currentFontOverride = pickLangFontOverride(graphemes[0].text, computedStyle, langFontConfigs);
            let start16 = graphemes[0].start16;
            let end16 = graphemes[0].end16;
            for (let i = 1; i < graphemes.length; i++) {
                const segment = graphemes[i];
                const kind = graphemeNeedsBitmapFallback(segment.text) ? 'bitmap' : 'text';
                const fontOverride = pickLangFontOverride(segment.text, computedStyle, langFontConfigs);
                if (kind === currentKind && fontOverrideKey(fontOverride) === fontOverrideKey(currentFontOverride)) {
                    end16 = segment.end16;
                    continue;
                }
                runs.push({
                    kind: currentKind,
                    text: text.slice(start16, end16),
                    start16,
                    end16,
                    fontOverride: currentFontOverride,
                });
                currentKind = kind;
                currentFontOverride = fontOverride;
                start16 = segment.start16;
                end16 = segment.end16;
            }
            runs.push({
                kind: currentKind,
                text: text.slice(start16, end16),
                start16,
                end16,
                fontOverride: currentFontOverride,
            });
            return runs;
        }
        function canvasFontForComputedStyle(cs) {
            const style = cs.fontStyle && cs.fontStyle !== 'normal' ? `${cs.fontStyle} ` : '';
            const weight = cs.fontWeight && cs.fontWeight !== 'normal' ? `${cs.fontWeight} ` : '';
            const size = `${parseFloat(cs.fontSize) || 16}px`;
            const family = cs.fontFamily || 'sans-serif';
            return `${style}${weight}${size} ${family}`.trim();
        }
        async function rasterizeInlineBitmapRun(text, rawRect, cs) {
            if (!text || rawRect.width <= 0 || rawRect.height <= 0)
                return null;
            const pad = 1;
            const cssWidth = rawRect.width + pad * 2;
            const cssHeight = rawRect.height + pad * 2;
            const ss = superSampleFactor(cssWidth, cssHeight);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.ceil(cssWidth * ss));
            canvas.height = Math.max(1, Math.ceil(cssHeight * ss));
            const ctx = canvas.getContext('2d');
            if (!ctx)
                return null;
            ctx.scale(ss, ss);
            ctx.clearRect(0, 0, cssWidth, cssHeight);
            ctx.font = canvasFontForComputedStyle(cs);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
            ctx.fillStyle = rgbaCss(parseColor(cs.color));
            const metrics = ctx.measureText(text || 'M');
            const ascent = metrics.actualBoundingBoxAscent || (parseFloat(cs.fontSize) || 16) * 0.8;
            const descent = metrics.actualBoundingBoxDescent || (parseFloat(cs.fontSize) || 16) * 0.2;
            const baseline = pad + Math.max(ascent, (rawRect.height - (ascent + descent)) / 2 + ascent);
            const letterSpacing = parseFloat(cs.letterSpacing) || 0;
            const wordSpacing = parseFloat(cs.wordSpacing) || 0;
            let x = pad;
            const graphemes = segmentGraphemes(text);
            for (let i = 0; i < graphemes.length; i++) {
                const segment = graphemes[i].text;
                ctx.fillText(segment, x, baseline);
                x += ctx.measureText(segment).width;
                if (i + 1 < graphemes.length) {
                    x += letterSpacing;
                    if (segment === ' ')
                        x += wordSpacing;
                }
            }
            const rgba = canvasToRawRgba(canvas);
            if (!rgba)
                return null;
            return {
                image: {
                    bytes: rgba.bytes,
                    width: rgba.width,
                    height: rgba.height,
                    format: IMG_RAW_RGBA,
                },
                offsetX: pad * layoutScale,
                offsetY: pad * layoutScale,
                cssWidth: cssWidth * layoutScale,
                cssHeight: cssHeight * layoutScale,
            };
        }
        function makeFont(cs) {
            const sizePx = (parseFloat(cs.fontSize) || 16) * layoutScale;
            let lh = parseFloat(cs.lineHeight);
            if (isNaN(lh))
                lh = sizePx * 1.2;
            else
                lh *= layoutScale;
            const letterSpacingPx = (parseFloat(cs.letterSpacing) || 0) * layoutScale;
            const wordSpacingPx = (parseFloat(cs.wordSpacing) || 0) * layoutScale;
            const decorationThicknessRaw = parseFloat((cs.textDecorationThickness || '').trim());
            const decorationThicknessPx = Number.isFinite(decorationThicknessRaw) && decorationThicknessRaw > 0
                ? decorationThicknessRaw * layoutScale
                : 0;
            const preserveWhitespace = /^(pre|pre-wrap|break-spaces)$/.test((cs.whiteSpace || '').trim()) ? 1 : 0;
            return {
                family: (cs.fontFamily || 'Helvetica').split(',')[0].replace(/['"]/g, '').trim(),
                sizePx,
                weight: weightNum(cs.fontWeight),
                italic: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique' ? 1 : 0,
                color: parseColor(cs.color),
                lineHeightPx: lh,
                align: alignNum(cs.textAlign),
                letterSpacingPx,
                wordSpacingPx,
                preserveWhitespace,
                decorationLineMask: textDecorationMask(cs),
                decorationThicknessPx,
            };
        }
        function applyFontOverride(font, fontOverride) {
            if (!fontOverride)
                return font;
            return {
                ...font,
                family: fontOverride.family,
                italic: fontOverride.italic,
                weight: fontOverride.weight,
            };
        }
        function pushTextNode(parentId, font, text, lines, opacity, renderMode = 0) {
            if (!text || lines.length === 0)
                return;
            // Single-pass min/max to avoid 4 array allocations + spread stack risk.
            let maxRight = lines[0].x + lines[0].w, minLeft = lines[0].x;
            let maxBottom = lines[0].y + lines[0].h, minTop = lines[0].y;
            for (let i = 1; i < lines.length; i++) {
                const l = lines[i];
                if (l.x < minLeft)
                    minLeft = l.x;
                if (l.x + l.w > maxRight)
                    maxRight = l.x + l.w;
                if (l.y < minTop)
                    minTop = l.y;
                if (l.y + l.h > maxBottom)
                    maxBottom = l.y + l.h;
            }
            nodes.push({
                id: nodes.length,
                parent: parentId,
                kind: 1,
                x: lines[0].x,
                y: lines[0].y,
                w: maxRight - minLeft,
                h: maxBottom - minTop,
                flags: F_FONT | (0),
                font,
                overflowHidden: false,
                opacity,
                renderMode,
                divisionDisable: false,
                pageBreak: false,
                text,
                lines,
            });
        }
        async function appendFormRasterNode(parentId, el, rawRect, cs) {
            const raster = await rasterizeElement(el, rawRect, quality, cs);
            if (!raster)
                return;
            const imageId = images.length + 1;
            images.push({
                id: imageId,
                bytes: raster.bytes,
                width: raster.width,
                height: raster.height,
                format: raster.format,
            });
            const rawX = raster.rawLeft + window.scrollX - offX;
            const rawY = raster.rawTop + window.scrollY - offY;
            nodes.push({
                id: nodes.length,
                parent: parentId,
                kind: 2,
                x: rawX * layoutScale,
                y: rawY * layoutScale,
                w: raster.cssWidth * layoutScale,
                h: raster.cssHeight * layoutScale,
                flags: F_IMAGE,
                overflowHidden: false,
                renderMode: 0,
                divisionDisable: false,
                pageBreak: false,
                imageId,
                objectFit: 0,
            });
        }
        function pushFormFieldEntry(nodeId, formControl) {
            formFields.push({
                id: formFields.length + 1,
                nodeId,
                kind: formControl.kind,
                interactiveKind: formControl.interactiveKind,
                name: formControl.name,
                value: formControl.value,
                defaultValue: formControl.defaultValue,
                placeholder: formControl.placeholder,
                checked: formControl.checked,
                disabled: formControl.disabled,
                readonly: formControl.readonly,
                required: formControl.required,
                multiple: formControl.multiple,
                placeholderShown: formControl.placeholderShown,
                password: formControl.password,
                textAlign: formControl.textAlign,
                padding: formControl.padding,
                options: formControl.options,
            });
        }
        function pushFormHiddenText(parentId, box, cs, text, multiline) {
            if (!text)
                return;
            const font = makeFont(cs);
            const paddingTop = (parseFloat(cs.paddingTop) || 0) * layoutScale;
            const paddingRight = (parseFloat(cs.paddingRight) || 0) * layoutScale;
            const paddingBottom = (parseFloat(cs.paddingBottom) || 0) * layoutScale;
            const paddingLeft = (parseFloat(cs.paddingLeft) || 0) * layoutScale;
            const contentX = box.x + paddingLeft;
            const contentY = box.y + paddingTop;
            const contentW = Math.max(1, box.w - paddingLeft - paddingRight);
            const contentH = Math.max(1, box.h - paddingTop - paddingBottom);
            if (!multiline) {
                const utf8End = utf8Offsets(text)[text.length];
                pushTextNode(parentId, font, text, [{
                        x: contentX,
                        y: contentY,
                        w: contentW,
                        h: Math.max(1, Math.min(contentH, font.lineHeightPx)),
                        start: 0,
                        end: utf8End,
                    }], undefined, 3);
                return;
            }
            const utf8 = utf8Offsets(text);
            const lines = [];
            const parts = text.split(/\r\n|\r|\n/);
            let cursor = 0;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const start = cursor;
                const end = start + part.length;
                lines.push({
                    x: contentX,
                    y: contentY + i * font.lineHeightPx,
                    w: contentW,
                    h: Math.max(1, font.lineHeightPx),
                    start: utf8[start],
                    end: utf8[end],
                });
                cursor = end;
                while (cursor < text.length && (text[cursor] === '\r' || text[cursor] === '\n'))
                    cursor += 1;
            }
            pushTextNode(parentId, font, text, lines, undefined, 3);
        }
        // Map from row group elements (THEAD/TBODY/TFOOT) to their deferred rowspan cells.
        // Used to fix table rowspan rendering order — see the comment in visit().
        const rowGroupDeferredCells = new Map();
        // `forcedBg`: an opaque backdrop colour (rgb string) to paint under a cell that
        // is otherwise background-transparent. Used for deferred rowspan cells in a
        // `border-collapse: collapse` table so they can cover the row separator borders
        // (e.g. a <tr>'s border-bottom) that visually cross them — mirroring how the
        // browser's collapse model hides internal row borders behind a spanning cell.
        async function visit(el, parentId, forcedBg) {
            if (ignoreElements && ignoreElements(el))
                return;
            const cs = getComputedStyle(el);
            if (cs.display === 'none')
                return;
            const id = nodes.length;
            const isImg = el.tagName === 'IMG' && imgToId.has(el);
            // For images, reuse the box frozen at conversion time instead of
            // re-measuring now — see the comment by imgRectAtConvert above.
            const rawRect = (isImg && imgRectAtConvert.get(el)) || el.getBoundingClientRect();
            const r = docRect(rawRect);
            const hrefAttr = el.tagName === 'A' ? el.getAttribute('href')?.trim() : '';
            const resolvedHref = hrefAttr ? el.href.trim() : '';
            const href = resolvedHref && !/^javascript:/i.test(resolvedHref) ? resolvedHref : undefined;
            const kind = isImg ? 2 : 0;
            const strategy = isImg ? 'vector' : classifyRenderStrategy(el, cs);
            const stats = getDebugPerfState().snapshot;
            if (strategy === 'full-raster')
                stats.strategyFullRaster += 1;
            else if (strategy === 'background-raster')
                stats.strategyBackgroundRaster += 1;
            else
                stats.strategyVector += 1;
            if (strategy === 'full-raster' && r.w > 0 && r.h > 0) {
                // Form controls can legitimately land here: native-appearance checkbox /
                // radio (isRasterTag) or a custom style whose ::after checkmark forces
                // foreground raster. The generic form collection below runs AFTER this
                // early return, so collect the field here or the interactive widget
                // silently vanishes from the PDF.
                const frFormControl = analyzeFormControl(el, cs, normalizedOptions.form);
                const frInteractive = frFormControl !== null
                    && shouldEmitInteractiveFormField(normalizedOptions.form, frFormControl.interactiveKind);
                if (frFormControl && frInteractive && shouldSuppressBaseNodeForInteractiveField(frFormControl.kind)) {
                    // Interactive checkbox/radio: the PDF widget renders its own appearance
                    // (box + check state), so baking the browser's pixels would only draw a
                    // second, stale-looking control underneath. Push a hidden placeholder
                    // node carrying the input's rect purely for widget placement.
                    nodes.push({
                        id,
                        parent: parentId,
                        kind: 0,
                        x: r.x, y: r.y, w: r.w, h: r.h,
                        flags: F_RENDER_MODE | F_DIVISION_DISABLE,
                        overflowHidden: false,
                        renderMode: 2,
                        divisionDisable: true,
                        pageBreak: false,
                    });
                    pushFormFieldEntry(id, frFormControl);
                    return;
                }
                const raster = await rasterizeElement(el, rawRect, quality, cs);
                if (raster) {
                    const imageId = images.length + 1;
                    images.push({
                        id: imageId,
                        bytes: raster.bytes,
                        width: raster.width,
                        height: raster.height,
                        format: raster.format,
                    });
                    const rawX = raster.rawLeft + window.scrollX - offX;
                    const rawY = raster.rawTop + window.scrollY - offY;
                    // Layout size comes from the CSS box, NOT the supersampled pixel count —
                    // otherwise a 2-3x raster would scale the element up by the same factor.
                    const scaledW = raster.cssWidth * layoutScale;
                    const scaledH = raster.cssHeight * layoutScale;
                    nodes.push({
                        id,
                        parent: parentId,
                        kind: 2,
                        x: rawX * layoutScale,
                        y: rawY * layoutScale,
                        w: scaledW,
                        h: scaledH,
                        flags: F_IMAGE,
                        overflowHidden: false,
                        renderMode: 0,
                        divisionDisable: el.hasAttribute('divisionDisable'),
                        pageBreak: el.hasAttribute('pageBreak'),
                        href,
                        imageId,
                        objectFit: 0,
                    });
                    let extractedAnyText = false;
                    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                    let textNode = walker.nextNode();
                    while (textNode) {
                        const text = textNode.data;
                        if (text && text.trim().length > 0) {
                            const owner = (textNode.parentElement || el);
                            const lines = collectTextLines(textNode);
                            if (lines.length > 0) {
                                const font = makeFont(getComputedStyle(owner));
                                pushTextNode(parentId, font, text, lines, undefined, 3);
                                extractedAnyText = true;
                            }
                        }
                        textNode = walker.nextNode();
                    }
                    if (!extractedAnyText) {
                        const hiddenText = collectFullRasterExtractableText(el);
                        if (hiddenText) {
                            const font = makeFont(cs);
                            const fontSizePx = parseFloat(cs.fontSize) || 16;
                            const lineHeightRaw = parseFloat(cs.lineHeight);
                            const lineHeightPx = isNaN(lineHeightRaw) ? fontSizePx * 1.2 : lineHeightRaw;
                            const baselineY = rawY * layoutScale + Math.max(0, (lineHeightPx - fontSizePx) * 0.5) * layoutScale;
                            const utf8End = utf8Offsets(hiddenText)[hiddenText.length];
                            pushTextNode(parentId, font, hiddenText, [{
                                    x: rawX * layoutScale,
                                    y: baselineY,
                                    w: Math.max(1, scaledW),
                                    h: Math.max(1, lineHeightPx * layoutScale),
                                    start: 0,
                                    end: utf8End,
                                }], undefined, 3);
                        }
                    }
                    // Textual controls that reach full-raster (e.g. transformed inputs):
                    // keep the raster visible and place the widget on top of it.
                    if (frFormControl && frInteractive) {
                        pushFormFieldEntry(id, frFormControl);
                    }
                    return;
                }
            }
            let bg = parseColor(cs.backgroundColor);
            // A deferred rowspan cell with a transparent background can't cover the row
            // separator borders that cross it (see forcedBg above). Substitute the
            // caller-provided opaque backdrop so the cell paints a solid fill matching
            // what the browser shows through the transparent cell.
            if (forcedBg && bg[3] <= 0.001) {
                bg = forcedBg;
            }
            // Semi-transparent backgrounds (e.g. rgba(27,31,35,0.05) used by CODE tags on
            // juejin.cn) cannot be faithfully reproduced in PDF — the Rust backend ignores
            // the alpha channel and paints an opaque rect. Pre-multiply with the nearest
            // opaque ancestor background so the blended colour matches the browser.
            if (bg[3] > 0.001 && bg[3] < 1) {
                const bd = await resolveBackdropColor(el, rawRect);
                const a = bg[3];
                const invA = 1 - a;
                bg = [
                    bg[0] * a + bd[0] * invA,
                    bg[1] * a + bd[1] * invA,
                    bg[2] * a + bd[2] * invA,
                    1,
                ];
            }
            // background-raster elements bake their whole background (incl. gradients and
            // ::before) into a backdrop image via foreignObject below. The vector box must
            // NOT carry a separate bg fill, or the PDF side will paint a second opaque rect
            // on top, doubling up on the already-rasterized background. However, a simple
            // solid color background (no gradient/url) is cheaper and more accurate to
            // paint as a vector rect; only complex backgrounds need the raster exclusion.
            const hasBg = bg[3] > 0.001
                && (strategy !== 'background-raster' || !hasComplexBackground(cs));
            // background-raster elements bake their whole background (incl. gradients) via
            // foreignObject below, so skip the gradient→image path to avoid a double backdrop.
            const gradientImage = !isImg && kind === 0 && r.w > 0 && r.h > 0 && strategy !== 'background-raster'
                ? convertBackgroundImageToImage(cs.backgroundImage, r.w, r.h, quality, hasBg ? bg : null)
                : null;
            const bw = [
                (parseFloat(cs.borderTopWidth) || 0) * layoutScale,
                (parseFloat(cs.borderRightWidth) || 0) * layoutScale,
                (parseFloat(cs.borderBottomWidth) || 0) * layoutScale,
                (parseFloat(cs.borderLeftWidth) || 0) * layoutScale,
            ];
            const bc = [
                parseColor(cs.borderTopColor),
                parseColor(cs.borderRightColor),
                parseColor(cs.borderBottomColor),
                parseColor(cs.borderLeftColor),
            ];
            const bs = [
                borderStyleNum(cs.borderTopStyle),
                borderStyleNum(cs.borderRightStyle),
                borderStyleNum(cs.borderBottomStyle),
                borderStyleNum(cs.borderLeftStyle),
            ];
            const sidePaints = (i, style) => bw[i] > 0 && style !== 'none' && style !== 'hidden' && bc[i][3] > 0.001;
            const isRoot = parentId === -1;
            const visibleBorder = !isRoot && (sidePaints(0, cs.borderTopStyle)
                || sidePaints(1, cs.borderRightStyle)
                || sidePaints(2, cs.borderBottomStyle)
                || sidePaints(3, cs.borderLeftStyle));
            const shadow = kind === 0 && !isRoot ? parseBoxShadow(cs.boxShadow) : [];
            const radius = [
                (parseFloat(cs.borderTopLeftRadius) || 0) * layoutScale,
                (parseFloat(cs.borderTopRightRadius) || 0) * layoutScale,
                (parseFloat(cs.borderBottomRightRadius) || 0) * layoutScale,
                (parseFloat(cs.borderBottomLeftRadius) || 0) * layoutScale,
            ];
            const hasRadius = (radius[0] + radius[1] + radius[2] + radius[3]) > 0;
            const overflowHidden = clipsOverflow(cs);
            const opacity = parseFloat(cs.opacity);
            const hasOpacity = opacity < 1;
            const dm = el.dataset.dom2pdfMode;
            const renderMode = dm === 'raster' ? 1 : dm === 'skip' ? 2 : 0;
            const objectPosition = isImg ? parseObjectPosition(cs.objectPosition) : null;
            const breakInside = cs.breakInside || cs.getPropertyValue('break-inside');
            const pageBreakInside = cs.getPropertyValue('page-break-inside');
            const divisionDisable = el.hasAttribute('divisionDisable')
                || breakInside === 'avoid'
                || breakInside === 'avoid-page'
                || pageBreakInside === 'avoid';
            const pageBreak = el.hasAttribute('pageBreak');
            let flags = 0;
            if (hasBg)
                flags |= F_BG;
            if (visibleBorder)
                flags |= F_BORDER;
            if (shadow.length > 0)
                flags |= F_SHADOW;
            if (hasRadius)
                flags |= F_RADIUS;
            if (overflowHidden)
                flags |= F_OVERFLOW;
            if (hasOpacity)
                flags |= F_OPACITY;
            if (isImg)
                flags |= F_IMAGE;
            if (isImg)
                flags |= F_AVOID_IMAGE_SPLIT;
            if (renderMode !== 0)
                flags |= F_RENDER_MODE;
            if (divisionDisable)
                flags |= F_DIVISION_DISABLE;
            if (pageBreak)
                flags |= F_PAGE_BREAK;
            if (href)
                flags |= F_LINK;
            const node = {
                id,
                parent: parentId,
                kind,
                x: r.x, y: r.y, w: r.w, h: r.h,
                flags,
                bg: hasBg ? bg : undefined,
                border: visibleBorder ? { w: bw, c: bc, s: bs } : undefined,
                shadow: shadow.length > 0 ? shadow.map((s) => ({
                    x: s.x * layoutScale,
                    y: s.y * layoutScale,
                    blur: s.blur * layoutScale,
                    spread: s.spread * layoutScale,
                    color: s.color,
                })) : undefined,
                radius: hasRadius ? radius : undefined,
                overflowHidden,
                opacity: hasOpacity ? opacity : undefined,
                renderMode,
                divisionDisable,
                pageBreak,
                href,
                imageId: isImg ? imgToId.get(el) : undefined,
                objectFit: isImg ? objectFitNum(cs.objectFit) : undefined,
                objectPositionXPct: objectPosition?.x.pct,
                objectPositionXOffsetPx: objectPosition?.x.offsetPx,
                objectPositionYPct: objectPosition?.y.pct,
                objectPositionYOffsetPx: objectPosition?.y.offsetPx,
            };
            if (isRasterTag(el, cs)) {
                node.renderMode = 1;
                if (renderMode === 0)
                    flags &= ~F_RENDER_MODE;
                if (node.renderMode !== 0)
                    flags |= F_RENDER_MODE;
                node.flags = flags;
            }
            nodes.push(node);
            if (gradientImage) {
                const imageId = images.length + 1;
                images.push({ id: imageId, ...gradientImage });
                const bgImageNode = {
                    id: nodes.length,
                    parent: id,
                    kind: 2,
                    x: r.x,
                    y: r.y,
                    w: r.w,
                    h: r.h,
                    flags: F_IMAGE | (hasRadius ? F_RADIUS : 0),
                    radius: hasRadius ? radius : undefined,
                    overflowHidden: false,
                    renderMode: 0,
                    divisionDisable: false,
                    pageBreak: false,
                    imageId,
                    objectFit: 0,
                };
                nodes.push(bgImageNode);
            }
            // background-raster: bake only this element's background + ::before into a
            // backdrop image laid under the (still vector) text. Same node shape as the
            // gradient backdrop above; pushed before children so it draws beneath text.
            if (strategy === 'background-raster' && !gradientImage && r.w > 0 && r.h > 0) {
                const bgRaster = await rasterizeElementBackgroundOnly(el, rawRect);
                if (bgRaster) {
                    const imageId = images.length + 1;
                    images.push({ id: imageId, ...bgRaster });
                    const bgImageNode = {
                        id: nodes.length,
                        parent: id,
                        kind: 2,
                        x: r.x,
                        y: r.y,
                        w: r.w,
                        h: r.h,
                        flags: F_IMAGE | (hasRadius ? F_RADIUS : 0),
                        radius: hasRadius ? radius : undefined,
                        overflowHidden: false,
                        renderMode: 0,
                        divisionDisable: false,
                        pageBreak: false,
                        imageId,
                        objectFit: 0,
                    };
                    nodes.push(bgImageNode);
                }
            }
            const formControl = analyzeFormControl(el, cs, normalizedOptions.form);
            if (formControl) {
                if (!node.divisionDisable) {
                    node.divisionDisable = true;
                    node.flags |= F_DIVISION_DISABLE;
                }
                const emitInteractive = shouldEmitInteractiveFormField(normalizedOptions.form, formControl.interactiveKind);
                const emitStaticText = normalizedOptions.form.mode === 'static'
                    && isTextualFormKind(formControl.kind)
                    && formControl.hiddenText.length > 0;
                const emitStaticRaster = normalizedOptions.form.mode === 'static'
                    && shouldRasterizeStaticFormControl(formControl.kind);
                if (emitInteractive && shouldSuppressBaseNodeForInteractiveField(formControl.kind)) {
                    if (node.renderMode === 0) {
                        node.renderMode = 1;
                        node.flags |= F_RENDER_MODE;
                    }
                }
                if (emitStaticRaster) {
                    if (node.renderMode === 0) {
                        node.renderMode = 1;
                        node.flags |= F_RENDER_MODE;
                    }
                    await appendFormRasterNode(id, el, rawRect, cs);
                }
                if (emitStaticText) {
                    pushFormHiddenText(id, node, cs, formControl.hiddenText, formControl.kind === FORM_FIELD_KIND_TEXTAREA || formControl.multiple);
                }
                if (emitInteractive) {
                    pushFormFieldEntry(node.id, formControl);
                }
                return;
            }
            // --- ::marker synthesis for <li> ---
            // When a <li> is rendered as vector / background-raster, its ::marker box
            // is NOT a real DOM child (browsers paint it from list-style semantics), so
            // the text-collector below would skip it. We synthesize a marker text node
            // here so bullets/numbers survive into the PDF. full-raster is handled by
            // cloneElementForRaster, which lets the browser paint the marker natively.
            if (strategy !== 'full-raster'
                && el.tagName.toUpperCase() === 'LI'
                && (cs.display || '').trim() === 'list-item') {
                const markerCs = getComputedStyle(el, '::marker');
                const listStyleType = (cs.listStyleType || markerCs.listStyleType || 'disc').trim();
                const idx = computeListItemIndex(el);
                if (idx !== null) {
                    const markerText = markerTextFromListStyle(listStyleType, markerCs.content, idx);
                    if (markerText) {
                        const markerFont = makeFont(markerCs);
                        const fontStr = `${markerCs.fontWeight} ${markerCs.fontSize} ${markerCs.fontFamily}`;
                        const textWidthPx = measureTextWidth(markerText, fontStr);
                        const fontSizePx = parseFloat(markerCs.fontSize) || parseFloat(cs.fontSize) || 16;
                        const lineHeightRaw = parseFloat(markerCs.lineHeight);
                        const lineHeightPx = isNaN(lineHeightRaw) ? fontSizePx * 1.2 : lineHeightRaw;
                        const liDoc = docRect(el.getBoundingClientRect());
                        const position = (cs.listStylePosition || 'outside').trim();
                        const listCs = el.parentElement ? getComputedStyle(el.parentElement) : null;
                        const listPaddingLeftPx = listCs ? (parseFloat(listCs.paddingLeft) || 0) : 0;
                        const paddingLeftPx = parseFloat(cs.paddingLeft) || 0;
                        const markerMarginLeftPx = parseFloat(markerCs.marginLeft) || 0;
                        const markerMarginRightPx = parseFloat(markerCs.marginRight) || 0;
                        const markerGapPx = Math.max(4, fontSizePx * 0.33);
                        // Vertical: align marker cap with the first text line of the <li>.
                        // Using liDoc.y + (lineHeight - fontSize)/2 approximates the text
                        // top for the common single-line case; multi-line <li> still get a
                        // correct first-line marker because lineHeight matches the first
                        // line box height.
                        const markerY = liDoc.y + (lineHeightPx - fontSizePx) * 0.5 * layoutScale;
                        const firstTextX = findFirstTextFragmentX(el);
                        let markerX;
                        let markerW;
                        let markerAlign = markerFont.align;
                        if (position === 'inside') {
                            // Marker flows as the first inline child, so it starts at the
                            // padding-left edge of the <li>.
                            markerX = firstTextX !== null
                                ? firstTextX - textWidthPx * layoutScale
                                : liDoc.x + paddingLeftPx * layoutScale;
                            markerW = Math.max(1, textWidthPx * layoutScale);
                        }
                        else {
                            // Outside: reserve the browser-like marker column (usually the
                            // parent list's padding-left) and right-align marker text inside it.
                            const markerRight = firstTextX !== null
                                ? firstTextX - markerGapPx * layoutScale
                                : liDoc.x + (paddingLeftPx - markerMarginRightPx) * layoutScale;
                            const markerColumnPx = Math.max(textWidthPx + markerGapPx, listPaddingLeftPx + markerMarginLeftPx);
                            markerW = Math.max(1, markerColumnPx * layoutScale);
                            markerX = markerRight - markerW;
                            markerAlign = 1;
                        }
                        const utf8End = utf8Offsets(markerText)[markerText.length];
                        const markerFontNode = { ...markerFont, align: markerAlign };
                        pushTextNode(id, markerFontNode, markerText, [{
                                x: markerX,
                                y: markerY,
                                w: markerW,
                                h: Math.max(1, fontSizePx * layoutScale),
                                start: 0,
                                end: utf8End,
                            }]);
                    }
                }
            }
            // --- Table rowspan fix ---
            // In HTML table rendering, cell backgrounds paint on top of row backgrounds.
            // However, in our flat tree walk, a subsequent <tr>'s background can cover
            // rowspan cells from a previous <tr>. To fix this, when visiting a table row
            // group (THEAD/TBODY/TFOOT), we defer <td>/<th> children with rowspan > 1
            // and visit them AFTER all <tr> siblings, so they paint on top.
            const isRowGroup = el.tagName === 'THEAD' || el.tagName === 'TBODY' || el.tagName === 'TFOOT' || el.tagName === 'TABLE';
            for (let child = el.firstChild; child; child = child.nextSibling) {
                if (child.nodeType === 1) {
                    const childEl = child;
                    // When visiting a <tr>, skip <td>/<th> with rowspan > 1 and collect them
                    // for deferred painting at the row-group level.
                    if (el.tagName === 'TR' && (childEl.tagName === 'TD' || childEl.tagName === 'TH')) {
                        const rowspan = childEl.rowSpan;
                        if (rowspan > 1) {
                            // Find the ancestor row group to defer this cell to. The cell will
                            // be visited as a direct child of the row group so it paints after
                            // all rows, letting its background cover row backgrounds below it.
                            const rowGroup = el.parentElement;
                            if (rowGroup && (rowGroup.tagName === 'THEAD' || rowGroup.tagName === 'TBODY' || rowGroup.tagName === 'TFOOT' || rowGroup.tagName === 'TABLE')) {
                                // Store a reference; the row group's visit will handle it.
                                if (!rowGroupDeferredCells.has(rowGroup)) {
                                    rowGroupDeferredCells.set(rowGroup, []);
                                }
                                rowGroupDeferredCells.get(rowGroup).push({ cell: childEl });
                                continue;
                            }
                        }
                    }
                    if (ignoreElements && ignoreElements(childEl))
                        continue;
                    await visit(childEl, id);
                }
                else if (child.nodeType === 3) {
                    const textNode = child;
                    const text = textNode.data;
                    if (!text)
                        continue;
                    const font = makeFont(cs);
                    const runs = normalizedOptions.langFontConfig
                        ? buildInlineRunsWithLangFont(text, cs, normalizedOptions.langFontConfig)
                        : buildInlineRuns(text);
                    const hasBitmapRun = runs.some((run) => run.kind === 'bitmap');
                    if (!hasBitmapRun) {
                        for (const run of runs) {
                            const lines = collectTextLines(textNode, run.start16, run.end16);
                            if (lines.length === 0)
                                continue;
                            pushTextNode(id, applyFontOverride(font, run.fontOverride), run.text, lines);
                        }
                        continue;
                    }
                    for (const run of runs) {
                        const fragments = collectTextFragments(textNode, run.start16, run.end16);
                        if (fragments.length === 0)
                            continue;
                        const runFont = applyFontOverride(font, run.fontOverride);
                        if (run.kind === 'text') {
                            const lines = linesFromFragments(run.text, run.start16, fragments);
                            pushTextNode(id, runFont, run.text, lines);
                            continue;
                        }
                        const bitmapNodes = [];
                        for (const fragment of fragments) {
                            const fragmentText = text.slice(fragment.start16, fragment.end16);
                            const raster = await rasterizeInlineBitmapRun(fragmentText, fragment.rawRect, cs);
                            if (!raster) {
                                bitmapNodes.length = 0;
                                break;
                            }
                            bitmapNodes.push({
                                image: raster.image,
                                x: fragment.x - raster.offsetX,
                                y: fragment.y - raster.offsetY,
                                w: raster.cssWidth,
                                h: raster.cssHeight,
                            });
                        }
                        if (bitmapNodes.length === 0) {
                            const fallbackLines = linesFromFragments(run.text, run.start16, fragments);
                            pushTextNode(id, runFont, run.text, fallbackLines);
                            continue;
                        }
                        for (const bitmapNode of bitmapNodes) {
                            const imageId = images.length + 1;
                            images.push({ id: imageId, ...bitmapNode.image });
                            nodes.push({
                                id: nodes.length,
                                parent: id,
                                kind: 2,
                                x: bitmapNode.x,
                                y: bitmapNode.y,
                                w: bitmapNode.w,
                                h: bitmapNode.h,
                                flags: F_IMAGE,
                                overflowHidden: false,
                                renderMode: 0,
                                divisionDisable: false,
                                pageBreak: false,
                                imageId,
                                objectFit: 0,
                            });
                        }
                        // Preserve extractable text for bitmap fallback runs by adding an
                        // invisible text node at the same geometry. Visual output still comes
                        // from the rasterized image nodes above.
                        const hiddenLines = linesFromFragments(run.text, run.start16, fragments);
                        // Emit an invisible text object instead of alpha=0. Many PDF text
                        // extractors keep `Tr 3` text but ignore fully transparent glyphs.
                        pushTextNode(id, runFont, run.text, hiddenLines, undefined, 3);
                    }
                }
            }
            // After visiting all children of a row group (THEAD/TBODY/TFOOT),
            // visit the deferred rowspan > 1 cells as direct children of the row group.
            // They are painted last so they render ON TOP of all <tr> backgrounds,
            // matching browser rendering order.
            if (isRowGroup && rowGroupDeferredCells.has(el)) {
                const deferred = rowGroupDeferredCells.get(el);
                rowGroupDeferredCells.delete(el);
                // In a `border-collapse: collapse` table, each <tr>'s border-bottom is
                // drawn as its own rect and visually crosses a spanning cell. The browser
                // hides those internal borders behind the spanning cell; we replicate that
                // by giving a transparent spanning cell an opaque backdrop so its fill (now
                // painted last, on top of the row borders) covers them. Cells that already
                // have their own background need no help.
                const tableEl = el.tagName === 'TABLE' ? el : el.closest('table');
                const collapsed = tableEl ? getComputedStyle(tableEl).borderCollapse === 'collapse' : false;
                for (const { cell } of deferred) {
                    let forcedBg;
                    if (collapsed && parseColor(getComputedStyle(cell).backgroundColor)[3] <= 0.001) {
                        forcedBg = await resolveBackdropColor(cell, cell.getBoundingClientRect());
                    }
                    await visit(cell, id, forcedBg);
                }
            }
        }
        await visit(root, -1);
        // Resolve config-level HF geometry.
        const staticHeader = staticHF ? resolveRegion(staticHF.header, false) : null;
        const staticFooter = staticHF ? resolveRegion(staticHF.footer, true) : null;
        // Function-form: sample page 1 to derive a uniform reserved band height.
        // (Pagination needs a single content-area height; per-page text is resolved
        // later by index.ts once totalPages is known.)
        let headerHPx = staticHeader?.heightPx ?? 0;
        let footerHPx = staticFooter?.heightPx ?? 0;
        if (typeof normalizedOptions.pageConfig === 'function' && pagination) {
            const sample = normalizedOptions.pageConfig(1, 1);
            if (sample) {
                const sh = resolveRegion(sample.header, false);
                const sf = resolveRegion(sample.footer, true);
                headerHPx = sh?.heightPx ?? 0;
                footerHPx = sf?.heightPx ?? 0;
            }
        }
        return {
            pageWidthPt, pageHeightPt, mTop, mRight, mBottom, mLeft,
            precision, pagination, compress, backgroundColor: normalizedOptions.backgroundColor ?? null,
            headerHPx, footerHPx,
            staticHeader, staticFooter,
            staticWatermark: typeof normalizedOptions.watermark === 'function'
                ? null
                : watermarkNeedsPerPageResolution(normalizedOptions.watermark)
                    ? null
                    : await resolveWatermark(normalizedOptions.watermark, images),
            perPageHF: [],
            perPageWatermark: [],
            fonts, nodes, formFields, images,
            metadata: metadata ?? null,
        };
    }
    /** Encode collected data into the v2 snapshot binary, attaching per-page HF. */
    function encodeSnapshot(data, perPageHF, perPageWatermark = []) {
        // Convert ResolvedPageHF[] to the [header, footer] pair shape encode() expects.
        const pairs = perPageHF.map((hf) => [hf.header, hf.footer]);
        return encode({ ...data, perPageHF: pairs, perPageWatermark });
    }
    function writeHF(w, hf) {
        w.f32(hf.heightPx);
        w.f32(hf.padding[0]);
        w.f32(hf.padding[1]);
        w.f32(hf.padding[2]);
        w.f32(hf.padding[3]);
        w.u16(hf.slots.length);
        for (const slot of hf.slots) {
            const clen = BinWriter.utf8Len(slot.content);
            const flen = BinWriter.utf8Len(slot.fontFamily);
            w.u16(clen);
            w.utf8(slot.content);
            w.f32(slot.color[0]);
            w.f32(slot.color[1]);
            w.f32(slot.color[2]);
            w.f32(slot.color[3]);
            w.u16(flen);
            w.utf8(slot.fontFamily);
            w.f32(slot.fontSizePx);
            w.u16(slot.fontWeight);
            w.u8(slot.italic);
            w.u8(slot.position);
            if (slot.position === 9 && slot.custom) {
                w.f32(slot.custom[0]);
                w.f32(slot.custom[1]);
            }
            else if (slot.position === 10 && slot.customPosition) {
                w.f32(slot.customPosition.xPct);
                w.f32(slot.customPosition.xOffsetPx);
                w.f32(slot.customPosition.yPct);
                w.f32(slot.customPosition.yOffsetPx);
                w.u8(slot.customPosition.anchor);
            }
        }
    }
    function writeOptHF(w, hf) {
        if (hf) {
            w.u8(1);
            writeHF(w, hf);
        }
        else {
            w.u8(0);
        }
    }
    function writeWatermark(w, watermark) {
        w.u8(watermark.kind);
        w.f32(watermark.angleDeg);
        w.f32(watermark.spacing[0]);
        w.f32(watermark.spacing[1]);
        w.f32(watermark.offset[0]);
        w.f32(watermark.offset[1]);
        w.u8(watermark.layer);
        if (watermark.kind === 0) {
            const tlen = BinWriter.utf8Len(watermark.text);
            const famLen = BinWriter.utf8Len(watermark.fontFamily);
            w.u16(tlen);
            w.utf8(watermark.text);
            w.f32(watermark.color[0]);
            w.f32(watermark.color[1]);
            w.f32(watermark.color[2]);
            w.f32(watermark.color[3]);
            w.u16(famLen);
            w.utf8(watermark.fontFamily);
            w.f32(watermark.fontSizePx);
            w.u16(watermark.fontWeight);
            w.u8(watermark.italic);
        }
        else {
            w.u32(watermark.imageId);
            w.f32(watermark.imageWidthPx);
            w.f32(watermark.imageHeightPx);
            w.f32(watermark.opacity);
        }
    }
    function writeOptWatermark(w, watermark) {
        if (watermark) {
            w.u8(1);
            writeWatermark(w, watermark);
        }
        else {
            w.u8(0);
        }
    }
    function writeString32(w, value) {
        const len = BinWriter.utf8Len(value);
        w.u32(len);
        w.utf8(value);
    }
    function writeFormField(w, field) {
        let flags = 0;
        if (field.checked)
            flags |= FORM_FLAG_CHECKED;
        if (field.disabled)
            flags |= FORM_FLAG_DISABLED;
        if (field.readonly)
            flags |= FORM_FLAG_READONLY;
        if (field.required)
            flags |= FORM_FLAG_REQUIRED;
        if (field.multiple)
            flags |= FORM_FLAG_MULTIPLE;
        if (field.placeholderShown)
            flags |= FORM_FLAG_PLACEHOLDER_SHOWN;
        if (field.password)
            flags |= FORM_FLAG_PASSWORD;
        w.u32(field.id);
        w.u32(field.nodeId);
        w.u8(field.kind);
        w.u8(field.interactiveKind);
        w.u8(field.textAlign);
        w.u16(flags);
        w.f32(field.padding[0]);
        w.f32(field.padding[1]);
        w.f32(field.padding[2]);
        w.f32(field.padding[3]);
        writeString32(w, field.name);
        writeString32(w, field.value);
        writeString32(w, field.defaultValue);
        writeString32(w, field.placeholder);
        w.u32(field.options.length);
        for (const option of field.options) {
            writeString32(w, option.label);
            writeString32(w, option.value);
            w.u8(option.selected ? 1 : 0);
        }
    }
    function encode(a) {
        const w = new BinWriter();
        w.bytes(new Uint8Array([0x44, 0x32, 0x50, 0x31])); // "D2P1"
        w.u32(16); // version 16 (PDF metadata / Info dictionary)
        w.f32(a.pageWidthPt);
        w.f32(a.pageHeightPt);
        w.f32(a.mTop);
        w.f32(a.mRight);
        w.f32(a.mBottom);
        w.f32(a.mLeft);
        // Config block
        w.u8(a.precision);
        w.u8(a.pagination ? 1 : 0);
        const bg = a.backgroundColor == null ? null : parseColor(a.backgroundColor);
        w.u8(bg && bg[3] > 0.001 ? 1 : 0);
        if (bg && bg[3] > 0.001) {
            w.f32(bg[0]);
            w.f32(bg[1]);
            w.f32(bg[2]);
            w.f32(bg[3]);
        }
        w.f32(a.headerHPx);
        w.f32(a.footerHPx);
        const hasStatic = a.staticHeader || a.staticFooter;
        w.u8(hasStatic ? 1 : 0);
        if (hasStatic) {
            writeOptHF(w, a.staticHeader);
            writeOptHF(w, a.staticFooter);
        }
        w.u8(a.compress ? 1 : 0);
        writeOptWatermark(w, a.staticWatermark);
        // v16: metadata block
        w.u8(a.metadata ? 1 : 0);
        if (a.metadata) {
            writeString32(w, a.metadata.title);
            writeString32(w, a.metadata.author);
            writeString32(w, a.metadata.subject);
            writeString32(w, a.metadata.keywords);
            writeString32(w, a.metadata.creator);
            writeString32(w, a.metadata.producer);
            writeString32(w, a.metadata.creationDate);
            writeString32(w, a.metadata.modDate);
        }
        // Fonts block
        w.u32(a.fonts.length);
        for (const f of a.fonts) {
            const famLen = BinWriter.utf8Len(f.family);
            w.u16(famLen);
            w.utf8(f.family);
            w.u8(f.style);
            w.u16(f.weight);
            w.u8(f.iconFont ? 1 : 0);
            w.u32(f.bytes.length);
            w.bytes(f.bytes);
        }
        // Per-page HF block
        w.u32(a.perPageHF.length);
        for (const pair of a.perPageHF) {
            writeOptHF(w, pair[0]);
            writeOptHF(w, pair[1]);
        }
        // Per-page watermark block
        w.u32(a.perPageWatermark.length);
        for (const watermark of a.perPageWatermark) {
            writeOptWatermark(w, watermark);
        }
        // Nodes
        w.u32(a.nodes.length);
        for (const n of a.nodes) {
            w.u32(n.id);
            w.i32(n.parent);
            w.u8(n.kind);
            w.f32(n.x);
            w.f32(n.y);
            w.f32(n.w);
            w.f32(n.h);
            let flags = n.flags;
            if (n.bg)
                flags |= F_BG;
            if (n.border)
                flags |= F_BORDER;
            if (n.shadow && n.shadow.length > 0)
                flags |= F_SHADOW;
            if (n.radius)
                flags |= F_RADIUS;
            if (n.overflowHidden)
                flags |= F_OVERFLOW;
            if (n.opacity !== undefined)
                flags |= F_OPACITY;
            if (n.font)
                flags |= F_FONT;
            if (n.imageId !== undefined)
                flags |= F_IMAGE;
            if (n.renderMode !== 0)
                flags |= F_RENDER_MODE;
            if (n.divisionDisable)
                flags |= F_DIVISION_DISABLE;
            if (n.pageBreak)
                flags |= F_PAGE_BREAK;
            if (n.href)
                flags |= F_LINK;
            w.u16(flags);
            if (n.bg) {
                w.f32(n.bg[0]);
                w.f32(n.bg[1]);
                w.f32(n.bg[2]);
                w.f32(n.bg[3]);
            }
            if (n.border) {
                w.f32(n.border.w[0]);
                w.f32(n.border.w[1]);
                w.f32(n.border.w[2]);
                w.f32(n.border.w[3]);
                for (let i = 0; i < 4; i++) {
                    w.f32(n.border.c[i][0]);
                    w.f32(n.border.c[i][1]);
                    w.f32(n.border.c[i][2]);
                    w.f32(n.border.c[i][3]);
                }
                w.u8(n.border.s[0]);
                w.u8(n.border.s[1]);
                w.u8(n.border.s[2]);
                w.u8(n.border.s[3]);
            }
            if (n.shadow && n.shadow.length > 0) {
                w.u8(n.shadow.length);
                for (const s of n.shadow) {
                    w.f32(s.x);
                    w.f32(s.y);
                    w.f32(s.blur);
                    w.f32(s.spread);
                    w.f32(s.color[0]);
                    w.f32(s.color[1]);
                    w.f32(s.color[2]);
                    w.f32(s.color[3]);
                }
            }
            if (n.radius) {
                w.f32(n.radius[0]);
                w.f32(n.radius[1]);
                w.f32(n.radius[2]);
                w.f32(n.radius[3]);
            }
            if (n.opacity !== undefined)
                w.f32(n.opacity);
            if (n.font) {
                const famLen = BinWriter.utf8Len(n.font.family);
                w.u16(famLen);
                w.utf8(n.font.family);
                w.f32(n.font.sizePx);
                w.u16(n.font.weight);
                w.u8(n.font.italic);
                w.f32(n.font.color[0]);
                w.f32(n.font.color[1]);
                w.f32(n.font.color[2]);
                w.f32(n.font.color[3]);
                w.f32(n.font.lineHeightPx);
                w.u8(n.font.align);
                w.f32(n.font.letterSpacingPx);
                w.f32(n.font.wordSpacingPx);
                w.u8(n.font.preserveWhitespace);
                w.u8(n.font.decorationLineMask);
                w.f32(n.font.decorationThicknessPx);
            }
            if (n.imageId !== undefined) {
                w.u32(n.imageId);
                w.u8(n.objectFit ?? 0);
                w.f32(n.objectPositionXPct ?? 0.5);
                w.f32(n.objectPositionXOffsetPx ?? 0);
                w.f32(n.objectPositionYPct ?? 0.5);
                w.f32(n.objectPositionYOffsetPx ?? 0);
            }
            if (n.renderMode !== 0)
                w.u8(n.renderMode);
            if (n.href) {
                const hrefLen = BinWriter.utf8Len(n.href);
                w.u32(hrefLen);
                w.utf8(n.href);
            }
            if (n.kind === 1) {
                const text = n.text ?? '';
                const tlen = BinWriter.utf8Len(text);
                w.u32(tlen);
                w.utf8(text);
                const lines = n.lines ?? [];
                w.u32(lines.length);
                for (const l of lines) {
                    w.f32(l.x);
                    w.f32(l.y);
                    w.f32(l.w);
                    w.f32(l.h);
                    w.u32(l.start);
                    w.u32(l.end);
                }
            }
        }
        // Form fields
        w.u32(a.formFields.length);
        for (const field of a.formFields) {
            writeFormField(w, field);
        }
        // Images
        w.u32(a.images.length);
        for (const img of a.images) {
            w.u32(img.id);
            w.u32(img.width);
            w.u32(img.height);
            w.u8(img.format);
            w.u32(img.bytes.length);
            w.bytes(img.bytes);
        }
        return w.result();
    }
    /** Compute page-break Y positions (document px, relative to root top) for overlays. */
    function computePageBreaks(root, options = {}) {
        const normalizedOptions = normalizeLegacyOptions(options);
        const [fmtW, fmtH] = resolvePageSize(normalizedOptions.format);
        const pageWidthPt = normalizedOptions.pageWidthPt ?? fmtW;
        const pageHeightPt = normalizedOptions.pageHeightPt ?? fmtH;
        const m = normalizedOptions.marginPt ?? 36;
        const mTop = Array.isArray(m) ? m[0] : m;
        const mRight = Array.isArray(m) ? m[1] : m;
        const mBottom = Array.isArray(m) ? m[2] : m;
        const mLeft = Array.isArray(m) ? m[3] : m;
        const pagination = normalizedOptions.pagination ?? false;
        if (!pagination)
            return [];
        const staticHF = resolveStaticHF(normalizedOptions, pagination);
        const headerHPt = (staticHF?.header?.height ?? 0) * PX_TO_PT;
        const footerHPt = (staticHF?.footer?.height ?? 0) * PX_TO_PT;
        const contentHpt = pageHeightPt - mTop - mBottom - headerHPt - footerHPt;
        const contentHpx = (contentHpt > 0 ? contentHpt : pageHeightPt - mTop - mBottom) / PX_TO_PT;
        const layoutScale = computeLayoutScale(root.getBoundingClientRect().width, pageWidthPt, mLeft, mRight);
        const rootH = root.getBoundingClientRect().height;
        const breakStep = contentHpx / layoutScale;
        if (!(breakStep > 0) || !(rootH > 0))
            return [];
        const rootRect = root.getBoundingClientRect();
        const epsilon = 0.5;
        const breaks = [];
        let pageStart = 0;
        let pageEnd = breakStep;
        const pushBreak = (y) => {
            const next = Math.max(0, Math.min(rootH, y));
            const prev = breaks.length > 0 ? breaks[breaks.length - 1] : 0;
            if (next <= prev + epsilon || next >= rootH - epsilon)
                return false;
            breaks.push(next);
            pageStart = next;
            pageEnd = next + breakStep;
            return true;
        };
        const advanceImplicitPages = (y) => {
            while (y >= pageEnd - epsilon && pageEnd < rootH - epsilon) {
                if (!pushBreak(pageEnd))
                    break;
            }
        };
        const directives = Array.from(root.querySelectorAll('[pageBreak], [divisionDisable]'))
            .map((el, order) => {
            const rect = el.getBoundingClientRect();
            const top = rect.top - rootRect.top;
            const bottom = rect.bottom - rootRect.top;
            return {
                bottom: Math.max(0, Math.min(rootH, bottom)),
                divisionDisable: el.hasAttribute('divisionDisable'),
                order,
                pageBreak: el.hasAttribute('pageBreak'),
                top: Math.max(0, Math.min(rootH, top)),
            };
        })
            .filter((item) => item.bottom > item.top + epsilon)
            .sort((a, b) => (a.top - b.top) || (a.order - b.order));
        for (const item of directives) {
            advanceImplicitPages(item.top);
            if (item.pageBreak) {
                if (item.top > pageStart + epsilon) {
                    pushBreak(item.top);
                }
                continue;
            }
            const height = item.bottom - item.top;
            if (height < breakStep - epsilon && item.bottom > pageEnd + epsilon && item.top > pageStart + epsilon) {
                pushBreak(item.top);
            }
        }
        advanceImplicitPages(rootH);
        return breaks;
    }
    /** Resolve per-page HF for a function-form pageConfig given totalPages. */
    function resolvePerPageHF(pageConfig, totalPages) {
        const out = [];
        for (let p = 0; p < totalPages; p++) {
            const cfg = pageConfig(p + 1, totalPages);
            if (!cfg) {
                out.push({ header: null, footer: null });
                continue;
            }
            if (pageConfigExcludesPage(cfg, p + 1)) {
                out.push({ header: null, footer: null });
                continue;
            }
            out.push({
                header: resolveRegion(cfg.header, false),
                footer: resolveRegion(cfg.footer, true),
            });
        }
        return out;
    }
    /** Resolve per-page HF for object-form pageConfig with excludePage(s) support. */
    function resolveStaticPageConfigHF(pageConfig, totalPages) {
        const out = [];
        for (let p = 0; p < totalPages; p++) {
            const pageNum = p + 1;
            if (pageConfigExcludesPage(pageConfig, pageNum)) {
                out.push({ header: null, footer: null });
                continue;
            }
            out.push({
                header: resolveRegion(pageConfig.header, false),
                footer: resolveRegion(pageConfig.footer, true),
            });
        }
        return out;
    }
    /** Replace placeholders in a resolved HF set (function-form: JS resolves). */
    function resolvePerPageHFText(perPage, totalPages) {
        return perPage.map((hf, p) => ({
            header: hf.header
                ? {
                    ...hf.header,
                    slots: hf.header.slots.map((slot) => ({
                        ...slot,
                        content: resolvePlaceholder(slot.content, p, totalPages),
                    })),
                }
                : null,
            footer: hf.footer
                ? {
                    ...hf.footer,
                    slots: hf.footer.slots.map((slot) => ({
                        ...slot,
                        content: resolvePlaceholder(slot.content, p, totalPages),
                    })),
                }
                : null,
        }));
    }
    /** Resolve per-page watermark for a function-form config given totalPages. */
    async function resolvePerPageWatermark(watermarkConfig, totalPages, images = [], imageCache = new Map()) {
        const out = [];
        for (let p = 0; p < totalPages; p++) {
            const pageNum = p + 1;
            const config = watermarkConfig(pageNum, totalPages);
            if (!config || configExcludesPage(config, pageNum)) {
                out.push({ watermark: null });
                continue;
            }
            out.push({ watermark: await resolveWatermark(config, images, imageCache) });
        }
        return out;
    }
    /** Resolve per-page watermark for object-form config with excludePage(s) support. */
    async function resolveStaticWatermarkPages(watermark, totalPages, images = [], imageCache = new Map()) {
        const out = [];
        for (let p = 0; p < totalPages; p++) {
            const pageNum = p + 1;
            out.push({
                watermark: configExcludesPage(watermark, pageNum) ? null : await resolveWatermark(watermark, images, imageCache),
            });
        }
        return out;
    }
    /** Replace placeholders in resolved watermark text (function-form: JS resolves). */
    function resolvePerPageWatermarkText(perPage, totalPages) {
        return perPage.map((entry, p) => (entry.watermark
            ? isResolvedTextWatermark(entry.watermark)
                ? { ...entry.watermark, text: resolvePlaceholder(entry.watermark.text, p, totalPages) }
                : entry.watermark
            : null));
    }

    var src = "(function () {\n    'use strict';\n\n    // AUTO-GENERATED by scripts/inline-wasm.mjs — do not edit.\n    // Source: wasm/pkg/dom2pdf_wasm.wasm (307.3 KB, 314699 bytes)\n    // Inlined as base64 so the published JS lib is a single file (no fetch needed).\n    const WASM_BASE64 = 'AGFzbQEAAAABzwIqYAF/AX9gA39/fwF+YAJ/fwBgA39/fwF/YAJ/fwF/YAN/f38AYAR/f39/AGAFf39/f38AYAABf2ABfwBgAn9/AX5gB39/f39/f38AYAZ/f39/f38AYAN/fX8AYAN/f30AYAV/f39/fwF/YAd/f39/f39/AX9gBH9/f38Bf2AFf399f38AYAZ/fX19fX8AYAJ/fQBgBn1/f39/fwBgBH9+f38Bf2ADf35/AX9gB39/f399fX8AYAd/f39/f319AGAGf399fX9/AGAFf39/f30AYAh/f39/f31/fwBgCH9/f399f39/AGAEf399fQBgB39/f319fX0AYAh/f39/f39/fwBgBH99fX8AYA9/f39/f39/f39/f319f38AYAAAYAR/fX9/AX9gBn9/f39/fwF/YAl/f39/f39+fn4AYAF9AX1gAn1/AX1gBX9+fn5+AAIXAQNlbnYPcmVwb3J0X3Byb2dyZXNzAAID1gTUBAUGBwUCBQgGBQkHBgYGAgkJBwQKCwcLBwwJBgcKBwoHBwcKBwcICAUICAUIBgYCBQQGBQYMAgcHAgYMAgcMBwcMBwUJCQQJBgYAAgUFBQUFBQIGAgICAgUCAgICAgICCQkCCQIJAgICAgkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQUFDQ4FBQUFBQUCDAUCDAUMBQwFDAUCDAUHDw8PDwUFBQUFBQYGBgYGBgYGBQUHBQYGBwcHEAsQCxALEAsQCxALDAwMDBAQEBAQEBAQBREREREMBQQCBgIGBAUEBAQEAgICAgUCBQUCAgEBAQEBAQESExQVDhIBAQEBAQEBEQUFBQcCDAkCBQUDAgICAgICAgUFBwcMAgQJDAYHBQIGBAwJAgUFBAwCFgkFAgIFAgICBQUCAgcGBgcCCQkJCQkJCQkJCQkJCQkJAAUHAgUXBgYFAAAABQUFBgICBQQFBgQRBQcFBQULGBkaDgACBhsFBRwHBhACCR0YAh4fCyAhIRMYBQICIgICBQIEAAIFBQkCBQIECQkEBQUCBQQJBAQDCQADAAQCAgQIBBEIBAURBCMEAgkJBwkJCQkMBwICBAQAIwUJEQICCQQCAgIACQQJAgIEAgICBAQDAgICAwUHAgQDBAIGBwkFAgYFAwkCIwUFAgQEAwMgDAUHBwsEJAYGJAUEBBEG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QQI7ARggAiACKQEuNwEaIAIgAikBNjcBIiACIAIvAT47ASogAkEMaiACQRhqIAJBFGoQhICAgAAgACACKAIUNgIIIAAgAikCDDcCACACQcAAaiSAgICAAAuGAQEEfyOAgICAAEEQayIDJICAgIAAIABBCGohBAJAIAIgAWtBHG4iBSAAKAIAIAAoAggiBmtNDQAgACAGIAVBBEEMEJKAgIAAIAAoAgghBgsgACgCBCEAIAMgBjYCCCADIAQ2AgQgAyAANgIMIAEgAiADQQRqEM2AgIAAIANBEGokgICAgAALowIBBH8jgICAgABBwABrIgMkgICAgAAgAigCBCEEIAIoAgAhBQJAIAAgAUYNACAAQRRqIQYgAigCCCAEQQxsaiECIAQgASAAa0EcbiIAaiEEA0AgA0EYaiAGQXxqKAIAIAYoAgAQ0YCAgAAgA0EkaiAGQXBqKAIAIAZBdGooAgAQ0YCAgAAgA0GBgICAADYCPCADQYGAgIAANgI0IAMgA0EkajYCOCADIANBGGo2AjAgA0EMakGbnMCAACADQTBqEPeDgIAAIANBJGpBAUEBEImAgIAAIANBGGpBAUEBEImAgIAAIAIgAygCFDYCCCACIAMpAgw3AgAgBkEcaiEGIAJBDGohAiAAQX9qIgANAAsLIAUgBDYCACADQcAAaiSAgICAAAuGAQEEfyOAgICAAEEQayIDJICAgIAAIABBCGohBAJAIAIgAWtBAnYiBSAAKAIAIAAoAggiBmtNDQAgACAGIAVBBEEMEJKAgIAAIAAoAgghBgsgACgCBCEAIAMgBjYCCCADIAQ2AgQgAyAANgIMIAEgAiADQQRqEM+AgIAAIANBEGokgICAgAALuwEBA38jgICAgABBIGsiAySAgICAACACKAIEIQQgAigCACEFAkAgACABRg0AIAIoAgggBEEMbGohAiAEIAEgAGtBAnYiAWohBANAIAMgADYCFCADQYKAgIAANgIcIAMgA0EUajYCGCADQQhqQZmewIAAIANBGGoQ94OAgAAgAiADKAIQNgIIIAIgAykCCDcCACACQQxqIQIgAEEEaiEAIAFBf2oiAQ0ACwsgBSAENgIAIANBIGokgICAgAALtwEBAn8jgICAgABBEGsiAySAgICAAANAAkACQCABIAJGDQAgAUEYai0AAEUNASADQQRqIAFBEGooAgAgAUEUaigCABDRgICAACADKAIEQX9GDQACQCAAKAIIIgQgACgCAEcNACAAIARBAUEEQQwQkoCAgAALIAAgBEEBajYCCCAAKAIEIARBDGxqIgQgAykCBDcCACAEIAMoAgw2AggMAQsgA0EQaiSAgICAAA8LIAFBHGohAQwACwtmAQF/I4CAgIAAQSBrIgMkgICAgAAgA0EMaiABIAIQ9oKAgAAgA0GBgICAADYCHCADIANBDGo2AhggAEGHqsCAACADQRhqEPeDgIAAIANBDGpBAUEBEImAgIAAIANBIGokgICAgAAL2wEBBX8jgICAgABBEGsiAiSAgICAACACIAFBIGoiAzYCAAJAIAEoAhhFDQADQCABEMqAgIAAIQQgASABKAIYQX9qIgU2AhggAkEEaiACIARBeGogBEF8ahDTgICAAAJAIAIoAgQNACAFDQEMAgsgAigCDCEFIAIoAgghBgJAIAAoAggiBCAAKAIARw0AIAAgBEEBQQRBCBCSgICAAAsgACAEQQFqNgIIIAAoAgQgBEEDdGoiBCAFNgIEIAQgBjYCACACIAM2AgAgASgCGA0ACwsgAkEQaiSAgICAAAvbAgcCfwF+AX8BfgF/AX4BfyOAgICAAEEQayIEJICAgIAAIAIoAgAhBSABKAIAIQIgBCADLwEAIgM7AQ4CQAJAIAIoAgAiAigCDEUNACACQRBqIARBDmoQo4CAgAAhBiACKAIEIgcgBqdxIQEgBkIZiEL/AINCgYKEiJCgwIABfiEIIAIoAgAhAkEAIQkgA0H//wNxIQMCQANAAkAgAiABaikAACIKIAiFIgZCf4UgBkL//fv379+//358g0KAgYKEiJCgwIB/gyIGUA0AA0AgAyACIAZ6p0EDdiABaiAHcUECdGsiC0F8ai8BAEYNAyAGQn98IAaDIgZQRQ0ACwsgCiAKQgGGg0KAgYKEiJCgwIB/g1BFDQIgASAJQQhqIglqIAdxIQEMAAsLIAAgBTYCBCAAIAtBfmovAQA2AghBASECDAELQQAhAgsgACACNgIAIARBEGokgICAgAALigEBBH8jgICAgABBEGsiAiSAgICAACAAQQhqIQMCQCABKAIEIAEoAgBrQQF2IgQgACgCACAAKAIIIgVrTQ0AIAAgBSAEQQRBCBCSgICAACAAKAIIIQULIAAoAgQhACACIAU2AgggAiADNgIEIAIgADYCDCABIAJBBGoQ1YCAgAAgAkEQaiSAgICAAAuaAQEHfyABKAIEIQIgASgCACEDAkAgACgCACIEIAAoAgQiBUYNACAAKAIIIgZBmAFqIQcgASgCCCACQQN0aiEAIAIgBSAEa0EBdiIBaiECA0AgBiAELwEAIgUQ5YGAgAAhCCAAQQRqIAcgBRDmgYCAADYCACAAIAg7AQAgBEECaiEEIABBCGohACABQX9qIgENAAsLIAMgAjYCAAvtAQEFfyOAgICAAEEwayICJICAgIAAIAIgAUEgaiIDNgIgIAJBGGogARDXgICAAAJAIAIoAhgiBEUNAANAIAJBJGogAkEgaiAEENiAgIAAAkAgAigCJA0AIAJBEGogARDXgICAACACKAIQIgQNAQwCCyACKAIsIQUgAi8BKCEGAkAgACgCCCIEIAAoAgBHDQAgACAEQQFBBEEIEJKAgIAACyAAIARBAWo2AgggACgCBCAEQQN0aiIEIAU2AgQgBCAGOwEAIAIgAzYCICACQQhqIAEQ14CAgAAgAigCCCIEDQALCyACQTBqJICAgIAAC9MBAwJ/AX4CfwJAAkAgASgCGCICDQBBACEDDAELAkACQCABKQMAIgRQDQAgASgCECEFDAELIAEoAhAhBSABKAIIIQMDQCAFQXBqIQUgAykDACEEIANBCGoiBiEDIARCgIGChIiQoMCAf4MiBEKAgYKEiJCgwIB/UQ0ACyABIAU2AhAgASAGNgIIIARCgIGChIiQoMCAf4UhBAsgASACQX9qNgIYIAEgBEJ/fCAEgzcDACAFIAR6p0ECdkEecWsiBUF+aiEDCyAAIAU2AgQgACADNgIAC4EFBwJ/AX4CfwF+A38BfgF/I4CAgIAAQRBrIgMkgICAgAAgASgCACgCACEBIAMgAi8BACIEOwEOAkAgASgCSCICQf////8HTw0AIAEgAkEBajYCSAJAAkACQCABKAJcRQ0AIAFB4ABqIANBDmoQo4CAgAAhBSABKAJUIgYgBadxIQcgBUIZiEL/AINCgYKEiJCgwIABfiEIIAEoAlAhCUEAIQogBEH//wNxIQsDQAJAIAkgB2opAAAiDCAIhSIFQn+FIAVC//379+/fv/9+fINCgIGChIiQoMCAf4MiBVANAANAIAsgCSAFeqdBA3YgB2ogBnFBA3RrIg1BeGovAQBGDQQgBUJ/fCAFgyIFUEUNAAsLIAwgDEIBhoNCgIGChIiQoMCAf4NQRQ0BIAcgCkEIaiIKaiAGcSEHDAALCwJAIAEoAgxFDQAgAUEQaiADQQ5qEKOAgIAAIQUgASgCBCIGIAWncSEHIAVCGYhC/wCDQoGChIiQoMCAAX4hCCABKAIAIQlBACEKIARB//8DcSELA0ACQCAJIAdqKQAAIgwgCIUiBUJ/hSAFQv/9+/fv37//fnyDQoCBgoSIkKDAgH+DIgVQDQADQCALIAkgBXqnQQN2IAdqIAZxQQN0ayINQXhqLwEARg0EIAVCf3wgBYMiBVBFDQALCyAMIAxCAYaDQoCBgoSIkKDAgH+DUEUNASAHIApBCGoiCmogBnEhBwwACwsgASACNgJIQQAhAQwBCyANQXxqKAIAIQcgASACNgJIIAEgBBDlgYCAACEBIAAgBzYCCCAAIAE7AQRBASEBCyAAIAE2AgAgA0EQaiSAgICAAA8LQYjQwIAAEKmEgIAAAAuOAQEEfyABKAIIIQIgASgCACEDIAEoAgQhBAJAA0AgAyAERg0BIAJBAWohAiADQZACaiEBIANBrAJqIgUhAyABKAIAQX9KDQACQCAAKAIIIgMgACgCAEcNACAAIANBAUEEQQQQkoCAgAALIAAgA0EBajYCCCAAKAIEIANBAnRqIAJBf2o2AgAgBSEDDAALCwvtAQEEfyOAgICAAEHAAGsiAiSAgICAAAJAIAEoAiAiAyAAKAIAIAAoAggiBGtNDQAgACAEIANBAkECEJKAgIAAIAAoAgghBAsgACgCBCEFIAJBEGogAUEk/AoAACACQQhqIAJBEGoQ24CAgAACQCACLwEIQQFxRQ0AIAIvAQohAyAFIARBAXRqIQEDQCABIAM7AQAgAUECaiEBIARBAWohBCACIAJBEGoQ24CAgAAgAi8BAiEDIAIvAQBBAXENAAsLIAAgBDYCCANAIAJBNGogAkEQahDcgICAACACKAI0DQALIAJBwABqJICAgIAAC2QBAn8jgICAgABBEGsiAiSAgICAACACQQRqIAEQ3ICAgAACQAJAIAIoAgQiAw0AQQAhAQwBC0EBIQEgAyACKAIMQQF0ai8BCCEDCyAAIAM7AQIgACABOwEAIAJBEGokgICAgAALhQIBBH8jgICAgABBEGsiAiSAgICAAAJAAkACQAJAAkAgASgCICIDDQAgASgCACEDIAFBADYCACADQQFHDQMgASgCDCEDIAEoAgghBAJAIAEoAgQiAUUNACAEIQUMAwtBACEFIANFDQEDQCAEKAIgIQQgA0F/aiIDDQAMAgsLIAEgA0F/ajYCIAJAIAEQ2oKAgAAiAUUNACACQQRqIAEQ6ICAgAAgACACKAIMNgIIIAAgAikCBDcCAAwEC0H40cCAABCmhICAAAALQQAhAyAEIQELIAIgAzYCDCACIAU2AgggAiABNgIEIAJBBGoQ44CAgAALIABBADYCAAsgAkEQaiSAgICAAAugAQEEfyOAgICAAEEQayICJICAgIAAIAJBCGogARDXgICAAAJAIAIoAggiA0UNAANAIAMvAQAhBAJAIAAoAggiAyAAKAIARw0AIAAgAyABKAIYQQFqIgVBfyAFG0ECQQIQkoCAgAALIAAgA0EBajYCCCAAKAIEIANBAXRqIAQ7AQAgAiABENeAgIAAIAIoAgAiAw0ACwsgAkEQaiSAgICAAAvSAQEDfyOAgICAAEEQayICJICAgIAAIAJBCGogARDfgICAAAJAIAIvAQhBAXFFDQAgAi8BCiEDA0ACQCAAKAIIIgQgACgCAEcNACAAIAQgASgCHCABKAIUa0EBdkEBakEBIAEoAhAbIAEoAgwgASgCBGtBAXZBACABKAIAG2pBAkECEJKAgIAACyAAIARBAWo2AgggACgCBCAEQQF0aiADOwEAIAIgARDfgICAACACLwECIQMgAi8BAEEBcQ0ACwsgARDggICAACACQRBqJICAgIAAC6QJBAp/AX0BfwF+I4CAgIAAQYABayICJICAgIAAIAJBGGpBCGohAyABKAIIIQQgASgCBCEFIAEoAgwhBiABKAIAIQcgASgCICEIIAEoAiQhCQJAAkADQAJAAkACQAJAIAdFDQAgBSAGRw0BIAIgBzYCHCACIAQ2AhggAkEYakECQQIQiYCAgAAgAUEANgIACyAIRQ0EIAggCUYNBCABIAhBrAJqIgo2AiBBACEHIAJBADYCFCACQoCAgIAgNwIMQQIhCyAIKAKAAUEBRw0CQQAhB0H//wNDAACAP0MAAAAAIAgqAoQBIgwgDEMAAAAAXRsiDCAMQwAAgD9eG0MAAHpElBDShICAACIM/AFBACAMQwAAAABgGyAMQwD/f0deGyIFQegHSQ0BDAILIAEgBUECajYCBCAFLwEAIQdBASEFDAQLIAJBDGoQz4KAgAAgAigCECILIAU7AQBBASEHIAJBATYCFAsCQCAIKAKsASIFRQ0AIAgoAqgBIgYgBUEFdGohDQNAAkACQEMAAAAAIAYqAhgiDCAMIAxcGyIMQwAAAAAgDEMAAAAAXhtDCtcjPF8NACADQZTCwIAAQeAA/AoAAEEMIQUDQAJAQf//A0MAAIA/QwAAAAAgAkEYaiAFaioCACAGKgIMlCIMIAxDAAAAAF0bIgwgDEMAAIA/XhtDAAB6RJQQ0oSAgAAiDPwBQQAgDEMAAAAAYBsgDEMA/39HXhsiBEF/akH//wNxQecHTw0AAkAgByACKAIMRw0AIAJBDGoQz4KAgAALIAIoAhAiCyAHQQF0aiAEOwEAIAIgB0EBaiIHNgIUCyAFQQhqIgVB7ABHDQAMAgsLQf//A0MAAIA/QwAAAAAgBioCDCIMIAxDAAAAAF0bIgwgDEMAAIA/XhtDAAB6RJQQ0oSAgAAiDPwBQQAgDEMAAAAAYBsgDEMA/39HXhsiBUF/akH//wNxQecHTw0AAkAgByACKAIMRw0AIAJBDGoQz4KAgAAgAigCECELCyALIAdBAXRqIAU7AQAgAiAHQQFqIgc2AhQLIAZBIGoiBiANRw0ACwsCQCAIKAIUQQFHDQBBJCEFA0ACQEH//wNDAACAP0MAAAAAIAggBWoqAgAiDCAMQwAAAABdGyIMIAxDAACAP14bQwAAekSUENKEgIAAIgz8AUEAIAxDAAAAAGAbIAxDAP9/R14bIgRBf2pB//8DcUHnB08NAAJAIAcgAigCDEcNACACQQxqEM+CgIAACyACKAIQIAdBAXRqIAQ7AQAgAiAHQQFqIgc2AhQLIAVBEGoiBUHkAEcNAAsLIAIoAgwiBEF/Rg0BIAIpAhAhDiABIAQ2AgggASAOpyIFNgIEIAEgBTYCACABIAUgDkIgiKdBAXRqIgY2AgwgBSEHIAohCAwACwsCQAJAIAEoAhAiBw0AQQAhBQwBCwJAIAEoAhQiBSABKAIcRg0AIAEgBUECajYCFCAFLwEAIQdBASEFDAILIAIgBzYCHCACIAEoAhg2AhggAkEYakECQQIQiYCAgABBACEFIAFBADYCEAsLIAAgBzsBAiAAIAU7AQAgAkGAAWokgICAgAALegECfyOAgICAAEEQayIBJICAgIAAAkAgACgCACICRQ0AIAEgAjYCDCABIAAoAgg2AgggAUEIakECQQIQiYCAgAALAkAgACgCECICRQ0AIAEgAjYCDCABIAAoAhg2AgggAUEIakECQQIQiYCAgAALIAFBEGokgICAgAALWAECfyAAKAIEIQECQCAAKAIAIgAoAgAiAkUNAANAIABBwAJBkAIgARtBBBC0g4CAACABQQFqIQEgAiIAKAIAIgINAAsLIABBwAJBkAIgARtBBBC0g4CAAAv4AQEFfyABKAIEIQICQAJAAkAgASgCCCIDIAEoAgAiAS8BjgJPDQAgASEEDAELA0AgASgCACIERQ0CIAEvAYwCIQMgAUHAAkGQAiACG0EEELSDgIAAIAJBAWohAiAEIQEgAyAELwGOAk8NAAsLAkACQCACDQAgA0EBaiEBIAQhBQwBCyAEIANBAnRqQZQCaiEBIAIhBgNAIAEoAgAiBUGQAmohASAGQX9qIgYNAAtBACEBCyAAIAM2AhQgACACNgIQIAAgBDYCDCAAIAE2AgggAEEANgIEIAAgBTYCAA8LIAFBwAJBkAIgAhtBBBC0g4CAACAAQQA2AgALVgECfyAAKAIEIQECQCAAKAIAIgAoAgAiAkUNAANAIABB0ABBICABG0EEELSDgIAAIAFBAWohASACIgAoAgAiAg0ACwsgAEHQAEEgIAEbQQQQtIOAgAAL8QEBBX8gASgCBCECAkACQAJAIAEoAggiAyABKAIAIgEvAQZPDQAgASEEDAELA0AgASgCACIERQ0CIAEvAQQhAyABQdAAQSAgAhtBBBC0g4CAACACQQFqIQIgBCEBIAMgBC8BBk8NAAsLAkACQCACDQAgA0EBaiEBIAQhBQwBCyAEIANBAnRqQSRqIQEgAiEGA0AgASgCACIFQSBqIQEgBkF/aiIGDQALQQAhAQsgACADNgIUIAAgAjYCECAAIAQ2AgwgACABNgIIIABBADYCBCAAIAU2AgAPCyABQdAAQSAgAhtBBBC0g4CAACAAQQA2AgALWAECfyAAKAIEIQECQCAAKAIAIgAoAgAiAkUNAANAIABB/ABBzAAgARtBBBC0g4CAACABQQFqIQEgAiIAKAIAIgINAAsLIABB/ABBzAAgARtBBBC0g4CAAAv1AQEFfyABKAIEIQICQAJAAkAgASgCCCIDIAEoAgAiAS8BMk8NACABIQQMAQsDQCABKAIAIgRFDQIgAS8BMCEDIAFB/ABBzAAgAhtBBBC0g4CAACACQQFqIQIgBCEBIAMgBC8BMk8NAAsLAkACQCACDQAgA0EBaiEBIAQhBQwBCyAEIANBAnRqQdAAaiEBIAIhBgNAIAEoAgAiBUHMAGohASAGQX9qIgYNAAtBACEBCyAAIAM2AhQgACACNgIQIAAgBDYCDCAAIAE2AgggAEEANgIEIAAgBTYCAA8LIAFB/ABBzAAgAhtBBBC0g4CAACAAQQA2AgALggECAX8BfiOAgICAAEEwayICJICAgIAAIAJBCGogARDigICAAAJAIAIoAghFDQAgACACKQIUNwIAIAAgAigCHDYCCCACIAIoAhAiADYCKCACIAIpAggiAzcDICABIAA2AgggASADNwIAIAJBMGokgICAgAAPC0HQuMCAABCmhICAAAALggECAX8BfiOAgICAAEEwayICJICAgIAAIAJBCGogARDkgICAAAJAIAIoAghFDQAgACACKQIUNwIAIAAgAigCHDYCCCACIAIoAhAiADYCKCACIAIpAggiAzcDICABIAA2AgggASADNwIAIAJBMGokgICAgAAPC0HQuMCAABCmhICAAAALggECAX8BfiOAgICAAEEwayICJICAgIAAIAJBCGogARDmgICAAAJAIAIoAghFDQAgACACKQIUNwIAIAAgAigCHDYCCCACIAIoAhAiADYCKCACIAIpAggiAzcDICABIAA2AgggASADNwIAIAJBMGokgICAgAAPC0HQuMCAABCmhICAAAALIwACQCAAKAIAQX9GDQAgABDrgICAACAAQQRBGBCJgICAAAsLOgEBfwJAIAAoAggiAUUNACAAKAIEQQhqIQADQCAAQQFBARCJgICAACAAQRhqIQAgAUF/aiIBDQALCws5AAJAIAAoAgBBf0YNACAAQQFBARCJgICAACAAQQxqQQFBARCJgICAACAAQRhqQQFBARCJgICAAAsLKgACQCAAKAIAQX9GDQAgAEEBQQEQiYCAgAAgAEEMakEBQQEQiYCAgAALCyQAAkAgACgCAEF/Rg0AIAAQ74CAgAAgAEEEQdQAEImAgIAACwtKAQF/AkAgACgCCCIBRQ0AIAAoAgRBMGohAANAIABBdGpBAUEBEImA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AhA2AgggACADKQIINwIAIANBIGokgICAgAAL8AEBA38jgICAgABBIGsiAySAgICAAAJAAkACQAJAIAG8RQ0AIANBFGogAkEAQQRBBBCWgICAACADKAIYIQQgAygCFEEBRg0CIANBADYCECADIAMoAhw2AgwgAyAENgIIIANBCGogAiABEIuBgIAAIAAgAygCEDYCCCAAIAMpAgg3AgAMAQsgA0EUaiACQQFBBEEEEJaAgIAAIAMoAhghBCADKAIUQQFGDQIgAygCHCEFIAAgAjYCCCAAIAU2AgQgACAENgIACyADQSBqJICAgIAADwsgBCADKAIcEO+DgIAAAAsgBCADKAIcEO+DgIAAAAuUAQEDfwJAIAEgACgCACAAKAIIIgNrTQ0AIAAgAyABQQRBBBCSgICAACAAKAIIIQMLIAAoAgQgA0ECdGohBAJAAkACQCABQQJJDQAgAUF/aiEFA0AgBCACOAIAIARBBGohBCAFQX9qIgUNAAsgAyABakF/aiEDDAELIAFFDQELIAQgAjgCACADQQFqIQMLIAAgAzYCCAvgAQEDfyOAgICAAEEQayIDJICAgIAAAkACQAJAAkAgAUH/AXENACADQQRqIAJBAUEBQQEQloCAgAAgAygCCCEBIAMoAgRFDQEgASADKAIMEO+DgIAAAAsgA0EEaiACQQBBAUEBEJaAgIAAIAMoAgghBCADKAIEQQFGDQIgACADKAIMIgU2AgQgACAENgIAAkAgAkUNACAFIAEgAvwLAAsgACACNgIIDAELIAMoAgwhBCAAIAI2AgggACAENgIEIAAgATYCAAsgA0EQaiSAgICAAA8LIAQgAygCDBDvg4CAAAAL7wEBAn8jgICAgABBIGsiAySAgICAAAJAAkACQAJAIAFFDQAgA0EUaiACQQBBBEEEEJaAgIAAIAMoAhghBCADKAIUQQFGDQIgA0EANgIQIAMgAygCHDYCDCADIAQ2AgggA0EIaiACIAEQjoGAgAAgACADKAIQNgIIIAAgAykCCDcCAAwBCyADQRRqIAJBAUEEQQQQloCAgAAgAygCGCEBIAMoAhRBAUYNAiADKAIcIQQgACACNgIIIAAgBDYCBCAAIAE2AgALIANBIGokgICAgAAPCyAEIAMoAhwQ74OAgAAACyABIAMoAhwQ74OAgAAAC5QBAQN/AkAgASAAKAIA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NwIEIABBAjYCAAwDCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIQUCQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIAU4AgggACABNgIEIABBAjYCAAwDCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIQYCQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIAY4AgggACABNgIEIABBAjYCAAwDCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIQcCQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIAc4AgggACABNgIEIABBAjYCAAwDCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIQgCQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIAg4AgggACABNgIEIABBAjYCAAwDCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIQkCQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIAk4AgggACABNgIEIABBAjYCAAwDCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIQoCQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIAo4AgggACABNgIEIABBAjYCAAwDCyADQcAIaiADQQhqELOCgIAAIAMtAMQIIQECQCADKALACCIEQX9GDQAgACADKADICDYADCAAIAMoAMUINgAJIAAgAToACCAAIAQ2AgQgAEECNgIADAMLIANBwAhqIANBCGoQs4KAgAAgAy0AxAghBAJAIAMoAsAIIgtBf0YNACAAIAMoAMgINgAMIAAgAygAxQg2AAkgACAEOgAIIAAgCzYCBCAAQQI2AgAMAwsgA0HACGogA0EIahCzgoCAACADLQDECCELAkAgAygCwAgiDEF/Rg0AIAAgAygAyAg2AAwgACADKADFCDYACSAAIAs6AAggACAMNgIEIABBAjYCAAwDCwJAIAtB/wFxDQBBACEMDAILIANBwAhqIANBCGoQtYKAgAAgAyoCxAghDQJAIAMoAsAIIgtBf0YNACAAIAMoAsgINgIMIAAgDTgCCCAAIAs2AgQgAEECNgIADAMLIANBwAhqIANBCGoQtYKAgAAgAyoCxAghDgJAIAMoAsAIIgtBf0YNACAAIAMoAsgINgIMIAAgDjgCCCAAIAs2AgQgAEECNgIADAMLIANBwAhqIANBCGoQtYKAgAAgAyoCxAghDwJAIAMoAsAIIgtBf0YNACAAIAMoAsgINgIMIAAgDzgCCCAAIAs2AgQgAEECNgIADAMLIANBwAhqIANBCGoQtYKAgAAgAyoCxAghEAJAIAMoAsAIIgtBf0YNACAAIAMoAsgINgIMIAAgEDgCCCAAIAs2AgQgAEECNgIADAMLQQEhDAwBCyADQYiAgIAANgKsBCADIANBFGo2AqgEIANBwAhqQbCHwIAAIANBqARqEPeDgIAAIAAgAygCyAg2AgwgACADKQLACDcCBCAAQQI2AgAMAQsgA0HACGogA0EIahC1goCAACADKgLECCERAkAgAygCwAgiC0F/Rg0AIAAgAygCyAg2AgwgACAROAIIIAAgCzYCBCAAQQI2AgAMAQsgA0HACGogA0EIahC1goCAACADKgLECCESAkAgAygCwAgiC0F/Rg0AIAAgAygCyAg2AgwgACASOAIIIAAgCzYCBCAAQQI2AgAMAQsgA0HACGogA0EIahCzgoCAACADLQDECCELAkAgAygCwAgiE0F/Rg0AIAAgAygAyAg2AAwgACADKADFCDYACSAAIAs6AAggACATNgIEIABBAjYCAAwBCwJAAkAgC0H/AXENACADQX42AiAMAQsgA0HACGogA0EIaiACEJ6DgIAAIAMgAykCxAg3A7gBIAMgAygCzAg2AsABAkAgAygCwAgiC0F+Rg0AIAMgAykC2Ag3AsAEIAMgAykC0Ag3ArgEIAMgAykDuAE3AqwEIAMgAygCwAE2ArQEIAMgCzYCqAQgA0HACGogA0EIaiACEJ6DgIAAIAMgAykCxAg3A7gBIAMgAygCzAg2AsABAkAgAygCwAgiC0F+Rw0AIAAgAygCwAE2AgwgACADKQO4ATcCBCAAQQI2AgAgA0GoBGoQ7oCAgAAMAwsgAyADKQLYCDcDWCADIAMpAtAINwNQIAMgAykDuAE3AkQgAyADKALAATYCTCADIAMpAqgENwMgIAMgAykCsAQ3AyggAyADKQK4BDcDMCADIAMpAsAENwM4IAMgCzYCQAwBCyAAIAMoAsABNgIMIAAgAykDuAE3AgQgAEECNgIADAELAkACQAJAAkACQAJAAkACQAJAIAJBB0sNAEEAIRQMAQsgA0HACGogA0EIahCzgoCAACADLQDECCELIAMoAsAIIhNBf0cNAiALQf8BcUEARyEUIAJBCEcNAQsgA0F/NgJgQQAhFQwECyADQcAIaiADQQhqIAIQoYOAgAAgAyADKQLECDcDqAQgAyADKALMCDYCsAQgAygCwAgiC0F+Rg0BIANB4ABqQRBqIANBwAhqQRBqQcgA/AoAACADIAs2AmAgAyADKQOoBDcCZCADIAMoArAENgJsQQEhFSACQQ9NDQMgA0HACGogA0EIahCzgoCAACADLQDECCELAkAgAygCwAgiE0F/Rg0AIAAgAygAyAg2AAwgACADKADFCDYACSAAIAs6AAggACATNgIEIABBAjYCAAwDCyALQf8BcUUNAyADQagEaiADQQhqELqCgIAAIAMgAykCrAQ3A5gCIAMgAygCtAQ2AqACAkAgAygCqARFDQAgACADKAKgAjYCDCAAIAMpA5gCNwIEIABBAjYCAAwDCyADQagEaiADQQhqELqCgIAAIAMgAykCrAQ3A6gCIAMgAygCtAQ2ArACAkAgAygCqARBAUcNACAAIAMoArACNgIMIAAgAykDqAI3AgQgAEECNgIAIANBmAJqQQFBARCJgICAAAwDCyADQagEaiADQQhqELqCgIAAIAMgAykCrAQ3A7gCIAMgAygCtAQ2AsACAkAgAygCqARBAUcNACAAIAMoAsACNgIMIAAgAykDuAI3AgQgAEECNgIAIANBqAJqQQFBARCJgICAACADQZgCakEBQQEQiYCAgAAMAwsgA0GoBGogA0EIahC6goCAACADIAMpAqwENwPIAiADIAMoArQENgLQAgJAIAMoAqgEQQFHDQAgACADKALQAjYCDCAAIAMpA8gCNwIEIABBAjYCACADQbgCakEBQQEQiYCAgAAgA0GoAmpBAUEBEImAgIAAIANBmAJqQQFBARCJgICAAAwDCyADQagEaiADQQhqELqCgIAAIAMgAykCrAQ3A9gCIAMgAygCtAQ2AuACAkAgAygCqARBAUcNACAAIAMoAuACNgIMIAAgAykD2AI3AgQgAEECNgIAIANByAJqQQFBARCJgICAACADQbgCakEBQQEQiYCAgAAgA0GoAmpBAUEBEImAgIAAIANBmAJqQQFBARCJgICAAAwDCyADQagEaiADQQhqELqCgIAAIAMgAykCrAQ3A+gCIAMgAygCtAQ2AvACAkAgAygCqARBAUcNACAAIAMoAvACNgIMIAAgAykD6AI3AgQgAEECNgIAIANB2AJqQQFBARCJgICAACADQcgCakEBQQEQiYCAgAAgA0G4AmpBAUEBEImAgIAAIANBqAJqQQFBARCJgICAACADQZgCakEBQQEQiYCAgAAMAwsgA0GoBGogA0EIahC6goCAACADIAMpAqwENwP4AiADIAMoArQENgKAAwJAIAMoAqgEQQFHDQAgACADKAKAAzYCDCAAIAMpA/gCNwIEIABBAjYCACADQegCakEBQQEQiYCAgAAgA0HYAmpBAUEBEImAgIAAIANByAJqQQFBARCJgICAACADQbgCakEBQQEQiYCAgAAgA0GoAmpBAUEBEImAgIAAIANBmAJqQQFBARCJgICAAAwDCyADQagEaiADQQhqELqCgIAAIAMgAykCrAQ3A7AIIAMgAygCtAQ2ArgIQQEhFQJAIAMoAqgEQQFHDQAgACADKAK4CDYCDCAAIAMpA7AINwIEIABBAjYCACADQfgCakEBQQEQiYCAgAAgA0HoAmpBAUEBEImAgIAAIANB2AJqQQFBARCJgICAACADQcgCakEBQQEQiYCAgAAgA0G4AmpBAUEBEImAgIAAIANBqAJqQQFBARCJgICAACADQZgCakEBQQEQiYCAgAAMAwsgAyADKAK4CDYCnAkgAyADKQOwCDcClAkgAyADKQOYAjcDwAggAyADKAKgAjYCyAggAyADKQOoAjcCzAggAyADKAKwAjYC1AggAyADKQO4AjcD2AggAyADKALAAjYC4AggAyADKALQAjYC7AggAyADKQPIAjcC5AggAyADKALgAjYC+AggAyADKQPYAjcD8AggAyADKALwAjYChAkgAyADKQPoAjcC/AggAyADKAKAAzYCkAkgAyADKQP4AjcDiAkgA0G4AWogA0HACGpB4AD8CgAADAQLIAAgAygAyAg2AAwgACADKADFCDYACSAAIAs6AAggACATNgIEIABBAjYCAAwECyAAIAMoArAENgIMIAAgAykDqAQ3AgQgAEECNgIADAMLIANB4ABqEO2AgIAADAILIANBfzYCuAELIANBwAhqIANBCGoQt4KAgAAgAygCxAghEwJAAkAgAygCwAgiC0F/Rg0AIAAgAygCyAg2AgwgACATNgIIIAAgCzYCBCAAQQI2AgAMAQsgA0GIA2ogExCTgoCAAAJAAkAgE0UNACADQcwIaiEWIANBxAhqIRcDQCADQcAIaiADQQhqELaCgIAAIAMvAcQIIQsCQCADKALACCIYQX9GDQAgACADLwHKCDsBDiAAIAMoAcYINgEKIAAgCzsBCCAAIBg2AgQgAEECNgIADAMLIANBwAhqIANBCGogCxC4goCAACADIBcpAgA3A6gEIAMgFygCCDYCsAQCQCADKALACEEBRw0AIAAgAygCsAQ2AgwgACADKQOoBDcCBCAAQQI2AgAMAwsgAyADKAKwBDYCuAggAyADKQOoBDcDsAggA0HACGogA0EIahCzgoCAACADLQDECCEZAkACQCADKALACCILQX9GDQAgACADKADICDYADCAAIAMoAMUINgAJIAAgGToACCAAIAs2AgQMAQsgA0HACGogA0EIahC2goCAACADLwHECCEaAkAgAygCwAgiC0F/Rg0AIAAgAy8Bygg7AQ4gACADKAHGCDYBCiAAIBo7AQggACALNgIEDAELIANBwAhqIANBCGoQs4KAgAAgAy0AxAghCwJAIAMoAsAIIhhBf0YNACAAIAMoAMgINgAMIAAgAygAxQg2AAkgACALOgAIIAAgGDYCBAwBCyADQcAIaiADQQhqELeCgIAAIAMoAsQIIRgCQCADKALACCIbQX9GDQAgACADKALICDYCDCAAIBg2AgggACAbNgIEDAELIANBwAhqIANBCGogGBC5goCAACADKALICCEYIAMoAsQIIRsCQCADKALACCIcQX9GDQAgACAYNgIMIAAgGzYCCCAAIBw2AgQMAQsgFiAbIBgQmIKAgAAgAyADKAK4CDYCyAggAyADKQOwCDcDwAggC0H/AXFBAEchGwJAIAMoApADIhggAygCiANHDQAgA0GIA2oQxYKAgAALIAMoAowDIBhBHGxqIgsgAykDwAg3AgAgCyADKQPICDcCCCALIAMpA9AINwIQIAsgGToAGyALIBs6ABogCyAaOwEYIAMgGEEBajYCkAMgE0F/aiITDQEMAgsLIABBAjYCACADQbAIakEBQQEQiYCAgAAMAQsgA0HACGogA0EIahC3goCAACADKALECCEZAkAgAygCwAgiC0F/Rg0AIAAgAygCyAg2AgwgACAZNgIIIAAgCzYCBCAAQQI2AgAMAQsgA0GUA2ogGRCVgoCAAAJAIBlFDQAgA0HACGpBEGohGCADQcAIakEEaiETIANBoANqQRBqIRogA0GgA2pBBGohGwNAIANBwAhqIANBCGogAhCeg4CAACADIBMpAgA3A6gEIAMgEygCCDYCsAQCQAJAAkAgAygCwAgiC0F+Rw0AIAAgAygCsAQ2AgwgACADKQOoBDcCBCAAQQI2AgAMAQsgGiAYKQIINwIIIBogGCkCADcCACAbIAMoArAENgIIIBsgAykDqAQ3AgAgAyALNgKgAyADQcAIaiADQQhqIAIQnoOAgAAgAyATKQIANwOwCCADIBMoAgg2ArgIIAMoAsAIIhZBfkcNASAAIAMoArgINgIMIAAgAykDsAg3AgQgAEECNgIAIANBoANqEO6AgIAACyADQZQDahD8gICAAAwDCyADIBgpAgg3A7AEIAMgGCkCADcDqAQgAyADKAK4CDYCyAggAyADKQOwCDcDwAgCQCADKAKcAyIXIAMoApQDRw0AIANBlANqEMqCgIAACyADKAKYAyAXQQZ0aiILIAMpAqADNwIAIAsgAykCqAM3AgggCyADKQKwAzcCECALIAMpArgDNwIYIAsgFjYCICALIAMpA8AINwIkIAsgAygCyAg2AiwgCyADKQOoBDcCMCALIAMpA7AENwI4IAMgF0EBajYCnAMgGUF/aiIZDQALCwJAAkAgFQ0AIANBADYCyAMgA0KAgICAwAA3AsADDAELIANBwAhqIANBCGoQt4KAgAAgAygCxAghGAJAAkAgAygCwAgiC0F/Rg0AIAAgAygCyAg2AgwgACAYNgIIIAAgCzYCBCAAQQI2AgAMAQsgA0GoBGogGBCRgoCAAAJAIBhFDQAgA0HACGpBEGohGiADQcQIaiEXA0AgA0HACGogA0EIaiACEKGDgIAAIAMgFykCADcD0AMgAyAXKAIINgLYAwJAIAMoAsAIIhlBfkcNACAAIAMoAtgDNgIMIAAgAykD0AM3AgQgAEECNgIAIANBqARqEPKAgIAADAMLIANB4ANqIBpByAD8CgAAAkAgAygCsAQiEyADKAKoBEcNACADQagEahDBgoCAAAsgAygCrAQgE0HYAGxqIgsgGTYCACALIAMpA9ADNwIEIAsgAygC2AM2AgwgC0EQaiADQeADakHIAPwKAAAgAyATQQFqNgKwBCAYQX9qIhgNAAsLIAMgAygCsAQ2AsgDIAMgAykCqAQ3A8ADDAELIANBlANqEPyAgIAADAELIANB9AVqIANBIGpBwAD8CgAAIANBvARqIANB4ABqQdgA/AoAACADQZQFaiADQbgBakHgAPwKAAAgAyABOgC+BiADIBQ6AL0GIAMgEjgCuAYgAyAROAK0BiADIBA4ArgEIAMgDzgCtAQgAyAOOAKwBCADIA04AqwEIAMgDDYCqAQgAyAEOgC/BiADIARB/wFxRToAvAYgA0HACGogA0EIahC3goCAACADKALECCEEAkACQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIAQ2AgggACABNgIEIABBAjYCAAwBCyADQcQGaiAEEJSCgIAAAkACQCAERQ0AIANBwAhqQQNqIRUgA0HACGpBBGohEyACQQtJIR0gAkENSSEeIAJBD0khH0EAIRwCQAJAAkADQCADQcAIaiADQQhqELeCgIAAIAMoAsQIIRsCQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIBs2AgggACABNgIEIABBAjYCAAwGCyADQcAIaiADQQhqELeCgIAAIAMoAsQIISACQCADKALACCIBQX9GDQAgACADKALICDYCDCAAICA2AgggACABNgIEIABBAjYCAAwGCyADQcAIaiADQQhqELOCgIAAIAMtAMQIIRcCQCADKALACCIBQX9GDQAgACADKADICDYADCAAIAMoAMUINgAJIAAgFzoACCAAIAE2AgQgAEECNgIADAYLIANBwAhqIANBCGoQtYKAgAAgAyoCxAghIQJAIAMoAsAIIgFBf0YNACAAIAMoAsgINgIMIAAgITgCCCAAIAE2AgQgAEECNgIADAYLIANBwAhqIANBCGoQtYKAgAAgAyoCxAghIgJAIAMoAsAIIgFBf0YNACAAIAMoAsgINgIMIAAgIjgCCCAAIAE2AgQgAEECNgIADAYLIANBwAhqIANBCGoQtYKAgAAgAyoCxAghIwJAIAMoAsAIIgFBf0YNACAAIAMoAsgINgIMIAAgIzgCCCAAIAE2AgQgAEECNgIADAYLIANBwAhqIANBCGoQtYKAgAAgAyoCxAghJAJAIAMoAsAIIgFBf0YNACAAIAMoAsgINgIMIAAgJDgCCCAAIAE2AgQgAEECNgIADAYLIANBwAhqIANBCGoQtoKAgAAgAy8BxAghCwJAIAMoAsAIIgFBf0YNACAAIAMvAcoIOwEOIAAgAygBxgg2AQogACALOwEIIAAgATYCBCAAQQI2AgAMBgtBACElQQAhGQJAIAtBAXFFDQAgA0HACGogA0EIahC1goCAACADKgLECCEOAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAOOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCERAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAROAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEQAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAQOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEmAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAmOAIIIAAgATYCBCAAQQI2AgAMBwtBASEZCwJAIAtBAnFFDQAgA0HACGogA0EIahC1goCAACADKgLECCEPAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAPOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCESAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACASOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEnAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAnOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEoAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAoOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEpAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACApOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEqAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAqOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCErAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACArOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEsAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAsOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEtAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAtOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEuAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAuOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEvAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAvOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEwAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAwOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCExAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAxOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEyAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAyOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCEzAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACAzOAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCE0AkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACA0OAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCE1AkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACA1OAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCE2AkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACA2OAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCE3AkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACA3OAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahC1goCAACADKgLECCE4AkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACA4OAIIIAAgATYCBCAAQQI2AgAMBwsgA0HACGogA0EIahCzgoCAACADLQDECCEaAkAgAygCwAgiAUF/Rg0AIAAgAygAyAg2AAwgACADKADFCDYACQwFCyADQcAIaiADQQhqELOCgIAAIAMtAMQIIRQCQCADKALACCIBQX9GDQAgACADKADICDYADCAAIAMoAMUINgAJIBQhGgwFCyADQcAIaiADQQhqELOCgIAAIAMtAMQIIRYCQCADKALACCIBQX9GDQAgACADKADICDYADCAAIAMoAMUINgAJIBYhGgwFCyADQcAIaiADQQhqELOCgIAAIAMtAMQIITkCQCADKALACCIBQX9GDQAgACADKADICDYADCAAIAMoAMUINgAJIDkhGgwFC0EBISULAkACQCALQYAIcQ0AIANBADYC2AYgA0KAgICAwAA3A9AGDAELIANBwAhqIANBCGoQs4KAgAAgAy0AxAghDAJAIAMoAsAIIgFBf0YNACAAIAMoAMgINgAMIAAgAygAxQg2AAkgACAMOgAIIAAgATYCBCAAQQI2AgAMBwsgA0GwCGogDBCWgoCAAAJAAkAgDEUNAANAIANBwAhqIANBCGoQtYKAgAAgAyoCxAghDQJAIAMoAsAIIgFBf0YNACADKALICCECDAMLIANBwAhqIANBCGoQtYKAgAAgAyoCxAghOgJAIAMoAsAIIgFBf0YNACADKALICCECIDohDQwDCyADQcAIaiADQQhqELWCgIAAIAMqAsQIITsCQCADKALACCIBQX9GDQAgAygCyAghAiA7IQ0MAwsgA0HACGogA0EIahC1goCAACADKgLECCE8AkAgAygCwAgiAUF/Rg0AIAMoAsgIIQIgPCENDAMLIANBwAhqIANBCGoQtYKAgAAgAyoCxAghPQJAIAMoAsAIIgFBf0YNACADKALICCECID0hDQwDCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIT4CQCADKALACCIBQX9GDQAgAygCyAghAiA+IQ0MAwsgA0HACGogA0EIahC1goCAACADKgLECCE/AkAgAygCwAgiAUF/Rg0AIAMoAsgIIQIgPyENDAMLIANBwAhqIANBCGoQtYKAgAAgAyoCxAghQAJAIAMoAsAIIgFBf0YNACADKALICCECIEAhDQwDCwJAIAMoArgIIhggAygCsAhHDQAgA0GwCGoQyIKAgAALIAMoArQIIBhBBXRqIgEgPDgCHCABIDs4AhggASA6OAIUIAEgDTgCECABIEA4AgwgASA/OAIIIAEgPjgCBCABID04AgAgAyAYQQFqNgK4CCAMQX9qIgwNAAsLIAMgAygCuAg2AtgGIAMgAykCsAg3A9AGDAELIAAgAjYCDCAAIA04AgggACABNgIEIABBAjYCACADQbAIakEEQSAQiYCAgAAMBgtBACFBQQAhQgJAIAtBBHFFDQAgA0HACGogA0EIahC1goCAACADKgLECCFDAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACBDOAIIIAAgATYCBCAAQQI2AgAMBAsgA0HACGogA0EIahC1goCAACADKgLECCFEAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACBEOAIIIAAgATYCBCAAQQI2AgAMBAsgA0HACGogA0EIahC1goCAACADKgLECCFFAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACBFOAIIIAAgATYCBCAAQQI2AgAMBAsgA0HACGogA0EIahC1goCAACADKgLECCFGAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACBGOAIIIAAgATYCBCAAQQI2AgAMBAtBASFCCwJAIAtBEHFFDQAgA0HACGogA0EIahC1goCAACADKgLECCE6AkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACA6OAIIIAAgATYCBCAAQQI2AgAMBAtBASFBCwJAAkAgC0EgcQ0AIANBfzYC4AYMAQsgA0HACGogA0EIahC2goCAACADLwHECCEBAkAgAygCwAgiDEF/Rg0AIAAgAy8Bygg7AQ4gACADKAHGCDYBCiAAIAE7AQggACAMNgIEIABBAjYCAAwECyADQcAIaiADQQhqIAEQuIKAgAAgAyATKQIANwOwCCADIBMoAgg2ArgIAkAgAygCwAhBAUcNACAAIAMoArgINgIMIAAgAykDsAg3AgQgAEECNgIADAQLIAMgAygCuAg2AsgHIAMgAykDsAg3A8AHIANBwAhqIANBCGoQtYKAgAAgAyoCxAghDQJAAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACANOAIIIAAgATYCBAwBCyADQcAIaiADQQhqELaCgIAAIAMvAcQIIQECQCADKALACCIMQX9GDQAgACADLwHKCDsBDiAAIAMoAcYINgEKIAAgATsBCCAAIAw2AgQMAQsgA0HACGogA0EIahCzgoCAACADLQDECCEMAkAgAygCwAgiGEF/Rg0AIAAgAygAyAg2AAwgACADKADFCDYACSAAIAw6AAggACAYNgIEDAELIANBwAhqIANBCGoQtYKAgAAgAyoCxAghOwJAIAMoAsAIIhhBf0YNACAAIAMoAsgINgIMIAAgOzgCCCAAIBg2AgQMAQsgA0HACGogA0EIahC1goCAACADKgLECCE8AkAgAygCwAgiGEF/Rg0AIAAgAygCyAg2AgwgACA8OAIIIAAgGDYCBAwBCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIT0CQCADKALACCIYQX9GDQAgACADKALICDYCDCAAID04AgggACAYNgIEDAELIANBwAhqIANBCGoQtYKAgAAgAyoCxAghPgJAIAMoAsAIIhhBf0YNACAAIAMoAsgINgIMIAAgPjgCCCAAIBg2AgQMAQsgA0HACGogA0EIahC1goCAACADKgLECCE/AkAgAygCwAgiGEF/Rg0AIAAgAygCyAg2AgwgACA/OAIIIAAgGDYCBAwBCyADQcAIaiADQQhqELOCgIAAIAMtAMQIIRgCQCADKALACCJHQX9GDQAgACADKADICDYADCAAIAMoAMUINgAJIAAgGDoACCAAIEc2AgQMAQsgA0HACGogA0EIahC1goCAACADKgLECCFAAkAgAygCwAgiR0F/Rg0AIAAgAygCyAg2AgwgACBAOAIIIAAgRzYCBAwBCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIUgCQCADKALACCJHQX9GDQAgACADKALICDYCDCAAIEg4AgggACBHNgIEDAELIANBwAhqIANBCGoQs4KAgAAgAy0AxAghRwJAIAMoAsAIIklBf0YNACAAIAMoAMgINgAMIAAgAygAxQg2AAkgACBHOgAIIAAgSTYCBAwBCwJAAkAgH0UNAEMAAAAAIUpBACFJDAELIANBwAhqIANBCGoQs4KAgAAgAy0AxAghSQJAIAMoAsAIIktBf0YNACAAIAMoAMgINgAMIAAgAygAxQg2AAkgACBJOgAIIAAgSzYCBAwCCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIUogAygCwAgiS0F/Rg0AIAAgAygCyAg2AgwgACBKOAIIIAAgSzYCBAwBCyADIAMoAsgHNgLoBiADIAMpA8AHNwPgBiADIEk6AJUHIAMgGDoAlAcgAyAMOgCTByADIAE7AZAHIAMgSjgCjAcgAyBIOAKIByADIEA4AoQHIAMgPzgCgAcgAyA+OAL8BiADID04AvgGIAMgPDgC9AYgAyA7OALwBiADIA04AuwGIAMgR0H/AXFBAEc6AJIHDAELIABBAjYCACADQcAHakEBQQEQiYCAgAAMAwtBACFLQQAhTAJAIAtBwABxRQ0AIANBwAhqIANBCGoQt4KAgAAgAygCxAghTQJAIAMoAsAIIgFBf0YNACAAIAMoAsgINgIMIAAgTTYCCCAAIAE2AgQgAEECNgIADAMLIANBwAhqIANBCGoQs4KAgAAgAy0AxAghTgJAIAMoAsAIIgFBf0YNACAAIAMoAMgINgAMIAAgAygAxQg2AAkgACBOOgAIIAAgATYCBCAAQQI2AgAMAwtBASFMAkAgHkUNAEMAAAAAIU9DAAAAPyFQQwAAAD8hUUMAAAAAIVIMAQsgA0HACGogA0EIahC1goCAACADKgLECCFQAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACBQOAIIIAAgATYCBCAAQQI2AgAMAwsgA0HACGogA0EIahC1goCAACADKgLECCFPAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACBPOAIIIAAgATYCBCAAQQI2AgAMAwsgA0HACGogA0EIahC1goCAACADKgLECCFRAkAgAygCwAgiAUF/Rg0AIAAgAygCyAg2AgwgACBROAIIIAAgATYCBCAAQQI2AgAMAwsgA0HACGogA0EIahC1goCAACADKgLECCFSIAMoAsAIIgFBf0YNACAAIAMoAsgINgIMIAAgUjgCCCAAIAE2AgQgAEECNgIADAILAkAgC0GAAXFFDQAgA0HACGogA0EIahCzgoCAACADLQDECCFLIAMoAsAIIgFBf0YNACAAIAMoAMgINgAMIAAgAygAxQg2AAkgACBLOgAIIAAgATYCBCAAQQI2AgAMAgsCQAJAAkAgHQ0AIAtBgBBxDQELIANBfzYCmAcMAQsgA0HACGogA0EIahC3goCAACADKALECCEBAkAgAygCwAgiDEF/Rg0AIAAgAygCyAg2AgwgACABNgIIIAAgDDYCBCAAQQI2AgAMAwsgA0HACGogA0EIaiABELiCgIAAIAMgEykCADcDsAggAyATKAIINgK4CAJAIAMoAsAIQQFHDQAgACADKAK4CDYCDCAAIAMpA7AINwIEIABBAjYCAAwDCyADIAMoArgINgKgByADIAMpA7AINwOYBwsgA0EANgK8ByADQoCAgIDAADcCtAcgA0F/NgKoBwJAAkAgF0H/AXFBAUcNACADQcAIaiADQQhqELeCgIAAIAMoAsQIIQECQCADKALACCIMQX9GDQAgACADKALICDYCDCAAIAE2AgggACAMNgIEIABBAjYCAAwCCyADQcAIaiADQQhqIAEQuIKAgAAgAyATKQIANwOwCCADIBMoAgg2ArgIAkAgAygCwAhBAUcNACAAIAMoArgINgIMIAAgAykDsAg3AgQgAEECNgIADAILIAMgAygCuAg2ArAHIAMgAykDsAg3A6gHIANBwAhqIANBCGoQt4KAgAAgAygCxAghUwJAIAMoAsAIIgFBf0YNACAAIAMoAsgINgIMIAAgUzYCCCAAIAE2AgQgAEECNgIADAILIFNFDQBBBCFUQQAhGEEAIQwDQCADQcAIaiADQQhqELWCgIAAIAMqAsQIITsCQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIDs4AgggACABNgIEIABBAjYCAAwDCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIQ0CQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIA04AgggACABNgIEIABBAjYCAAwDCyADQcAIaiADQQhqELWCgIAAIAMqAsQIITwCQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIDw4AgggACABNgIEIABBAjYCAAwDCyADQcAIaiADQQhqELWCgIAAIAMqAsQIIT0CQCADKALACCIBQX9GDQAgACADKALICDYCDCAAID04AgggACABNgIEIABBAjYCAAwDCyADQcAIaiADQQhqELeCgIAAIAMoAsQIIUcCQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIEc2AgggACABNgIEIABBAjYCAAwDCyADQcAIaiADQQhqELeCgIAAIAMoAsQIIUkCQCADKALACCIBQX9GDQAgACADKALICDYCDCAAIEk2AgggACABNgIEIABBAjYCAAwDCwJAIAwgAygCtAdHDQAgA0G0B2oQyIKAgAAgAygCuAchVAsgVCAYaiIBIDs4AgAgAUEcaiANOAIAIAFBGGpBADYCACABQRRqIEk2AgAgAUEQaiBHNgIAIAFBDGogPTgCACABQQhqIDw4AgAgAUEEaiANOAIAIAMgDEEBaiIMNgK8ByAYQSBqIRggUyAMRw0ACwsgFSADKALYBjYACCAVIAMpA9AGNwAAIAtBCXZBAXEhGCALQQh2QQFxIUcgC0EDdkEBcSFJAkAgAygCzAYiDCADKALEBkcNACADQcQGahDJgoCAAAsgAygCyAYgDEGsAmxqIgEgTjoAoAEgASBSOAKcASABIFE4ApgBIAEgTzgClAEgASBQOAKQASABIE02AowBIAEgTDYCiAEgASA6OAKEASABIEE2AoABIAEgRjgCfCABIEU4AnggASBEOAJ0IAEgQzgCcCABIEI2AmwgASA5OgBrIAEgFjoAaiABIBQ6AGkgASAaOgBoIAEgKDgCZCABICc4AmAgASASOAJcIAEgDzgCWCABIDg4AlQgASA3OAJQIAEgNjgCTCABIDU4AkggASA0OAJEIAEgMzgCQCABIDI4AjwgASAxOAI4IAEgMDgCNCABIC84AjAgASAuOAIsIAEgLTgCKCABICw4AiQgASArOAIgIAEgKjgCHCABICk4AhggASAlNgIUIAEgJjgCECABIBA4AgwgASAROAIIIAEgDjgCBCABIBk2AgAgASADKQDHCDcAqAEgASADKQDACDcAoQEgASADKQK0BzcCsAEgASADKAK8BzYCuAEgAUG8AWogA0HgBmpBOPwKAAAgASBLOgCqAiABIBc6AKkCIAEgGDoAqAIgASBHOgCnAiABIEk6AKYCIAEgCzsBpAIgASAkOAKgAiABICM4ApwCIAEgIjgCmAIgASAhOAKUAiABICA2ApACIAEgGzYCjAIgASADKAKgBzYC/AEgASADKQOYBzcC9AEgASADKQOoBzcCgAIgASADKAKwBzYCiAIgAyAMQQFqNgLMBiAcQQFqIhwgBEcNAQwFCwsgA0G0B2pBBEEgEImAgIAAAkAgAygCqAdBf0YNACADQagHakEBQQEQiYCAgAALIAMoApgHQX9GDQAgA0GYB2pBAUEBEImAgIAACyADKALgBkF/Rg0AIANB4AZqQQFBARCJgICAAAsgA0HQBmpBBEEgEImAgIAADAILIAAgGjoACCAAIAE2AgQgAEECNgIADAELAkACQCACQQpLDQAgA0EANgLIByADQoCAgIDAADcCwAcMAQsgA0HACGogA0EIahC3goCAACADKALECCEEAkAgAygCwAgiAkF/Rg0AIAAgAygCyAg2AgwgACAENgIIIAAgAjYCBCAAQQI2AgAMAgsgA0GwCGogBBCXgoCAAAJAIARFDQAgA0HACGpBEGohEyADQcQIaiELA0AgA0HACGogA0EIahCgg4CAACADIAspAgA3A9AHIAMgCygCCDYC2AcCQCADKALACCIMQX9HDQAgACADKALYBzYCDCAAIAMpA9AHNwIEIABBAjYCACADQbAIahD+gICAAAwECyADQeAHaiATQdAA/AoAAAJAIAMoArgIIgEgAygCsAhHDQAgA0GwCGoQy4KAgAALIAMoArQIIAFB4ABsaiICIAw2AgAgAiADKQPQBzcCBCACIAMoAtgHNgIMIAJBEGogA0HgB2pB0AD8CgAAIAMgAUEBajYCuAggBEF/aiIEDQALCyADIAMoArgINgLIByADIAMpArAINwPABwsgA0HACGogA0EIahC3goCAACADKALECCEBAkACQCADKALACCICQX9GDQAgACADKALICDYCDCAAIAE2AgggACACNgIEIABBAjYCAAwBCyADQbAIaiABEJOCgIAAAkACQCABRQ0AA0AgA0HACGogA0EIahC3goCAACADKALECCELAkAgAygCwAgiAkF/Rg0AIAAgAygCyAg2AgwgACALNgIIIAAgAjYCBAwDCyADQcAIaiADQQhqELeCgIAAIAMoAsQIIQwCQCADKALACCICQX9GDQAgACADKALICDYCDCAAIAw2AgggACACNgIEDAMLIANBwAhqIANBCGoQt4KAgAAgAygCxAghEwJAIAMoAsAIIgJBf0YNACAAIAMoAsgINgIMIAAgEzYCCCAAIAI2AgQMAwsgA0HACGogA0EIahCzgoCAACADLQDECCEYAkAgAygCwAgiAkF/Rg0AIAAgAygAyAg2AAwgACADKADFCDYACSAAIBg6AAggACACNgIEDAMLIANBwAhqIANBCGoQt4KAgAAgAygCxAghAgJAIAMoAsAIIgRBf0YNACAAIAMoAsgINgIMIAAgAjYCCCAAIAQ2AgQMAwsgA0HACGogA0EIaiACELmCgIAAIAMoAsgIIQIgAygCxAghBAJAIAMoAsAIIhdBf0YNACAAIAI2AgwgACAENgIIIAAgFzYCBAwDCyADQcAIaiAEIAIQmIKAgAACQCADKAK4CCIEIAMoArAIRw0AIANBsAhqEMWCgIAACyADKAK0CCAEQRxsaiICIAMpAsAINwIAIAIgAygCyAg2AgggAiAYOgAYIAIgEzYCFCACIAw2AhAgAiALNgIMIAMgBEEBajYCuAggAUF/aiIBDQALCyADQcAIaiADQagEakGYAvwKAAAgAyADKAKQAzYC4AogAyADKQKIAzcC2AogAyADKQKUAzcC5AogAyADKAKcAzYC7AogAyADKQPAAzcC8AogAyADKALIAzYC+AogAyADKQLEBjcC/AogAyADKALMBjYChAsgAyADKALIBzYCkAsgAyADKQPABzcCiAsgAyADKAK4CDYCnAsgAyADKQKwCDcClAsgACADQcAIakHgAvwKAAAgACAKOAL0AiAAIAk4AvACIAAgCDgC7AIgACAHOALoAiAAIAY4AuQCIAAgBTgC4AIMBwsgAEECNgIAIANBsAhqEPqAgIAACyADQcAHahD+gICAAAsgA0HEBmoQ+ICAgAALIANBqARqEIaBgIAAIANBwANqEPKAgIAAIANBlANqEPyAgIAAIANBiANqEPSAgIAADAMLIANBiANqEPSAgIAACyADQbgBahDwgICAACADQeAAahDtgICAAAsgA0EgahDxgICAAAsgA0GgC2okgICAgAALrAEBAn8jgICAgABBIGsiAySAgICAACADQgA3AxggA0IANwMQIANCADcDCCADQgA3AwAgAyACQSAgAkEgSSIEGyICIAEgAkGw1sCAABDsg4CAAAJAIARFDQAgAyACakEgIAJrIgJB7MvAgAAgAkHA1sCAABDsg4CAAAsgACADKQMYNwAYIAAgAykDEDcAECAAIAMpAwg3AAggACADKQMANwAAIANBIGokgICAgAALyQcDA38Bfg5/I4CAgIAAQeAAayIDJICAgIAAIANBGGogAkEAQQFBARCWgICAACADKAIcIQQCQCADKAIYQQFGDQAg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ACACQRBqJICAgIAAC3EBAn8jgICAgABBEGsiAiSAgICAACACQQRqIAFBAEEEQRwQloCAgAAgAigCCCEBAkAgAigCBEEBRw0AIAEgAigCDBDvg4CAAAALIAIoAgwhAyAAQQA2AgggACADNgIEIAAgATYCACACQRBqJICAgIAAC3IBAn8jgICAgABBEGsiAiSAgICAACACQQRqIAFBAEEEQawCEJaAgIAAIAIoAgghAQJAIAIoAgRBAUcNACABIAIoAgwQ74OAgAAACyACKAIMIQMgAEEANgIIIAAgAzYCBCAAIAE2AgAgAkEQaiSAgICAAAtyAQJ/I4CAgIAAQRBrIgIkgICAgAAgAkEEaiABQQBBBEHAABCWgICAACACKAIIIQECQCACKAIEQQFHDQAgASACKAIMEO+DgIAAAAsgAigCDCEDIABBADYCCCAAIAM2AgQgACABNgIAIAJBEGokgICAgAALcQECfyOAgICAAEEQayICJICAgIAAIAJBBGogAUEAQQRBIBCWgICAACACKAIIIQECQCACKAIEQQFHDQAgASACKAIMEO+DgIAAAAsgAigCDCEDIABBADYCCCAAIAM2AgQgACABNgIAIAJBEGokgICAgAALcgECfyOAgICAAEEQayICJICAgIAAIAJBBGogAUEAQQRB4AAQloCAgAAgAigCCCEBAkAgAigCBEEBRw0AIAEgAigCDBDvg4CAAAALIAIoAgwhAyAAQQA2AgggACADNgIEIAAgATYCACACQRBqJICAgIAAC5MBAQN/I4CAgIAAQRBrIgMkgICAgAAgA0EEaiACQQBBAUEBEJaAgIAAIAMoAgghBAJAIAMoAgRBAUYNACADKAIMIQUgAEEANgIIIAAgBTYCBCAAIAQ2AgACQCACRQ0AAkAgAkUNACAFIAEgAvwKAAALIAAgAjYCCAsgA0EQaiSAgICAAA8LIAQgAygCDBDvg4CAAAALXAEBfwJAAkACQCACIAAoAgAgACgCCCIDa00NACAAIAMgAkEBQQEQkoCAgAAgACgCCCEDDAELIAJFDQELIAJFDQAgACgCBCADaiABIAL8CgAACyAAIAMgAmo2AggLngIBAX8jgICAgABBIGsiBSSAgICAAAJAAkACQCABKAIgQX9GDQAgBSABQSBqIAIgAyAEEJuCgIAAIAUoAgghBCAFKAIEIQEM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QAJAAkACQAJAAkAgAigCBCIDQX9GDQAgACACKQIINwIEIAAgAzYCAAwBCyABKAIIIgMgASgCBCIETw0BIANBAWoiBSAETw0CIANBAmoiBiAETw0DIANBA2oiByAETw0EIAEoAgAiBCADai0AACEIIAQgBWotAAAhBSAAQX82AgAgBCAHai0AACEHIAQgBmotAAAhBCABIANBBGo2AgggACAIIAVBCHRyIARBEHRyIAdBGHRyNgIECyACQRBqJICAgIAADwsgAyAEQZzMwIAAEJGEgIAAAAsgBSAEQazMwIAAEJGEgIAAAAsgBiAEQbzMwIAAEJGEgIAAAAsgByAEQczMwIAAEJGEgIAAAAvRAQEFfyOAgICAAEEQayICJICAgIAAIAJBBGogAUECELSCgIAAAkACQAJAAkAgAigCBCIDQX9GDQAgACACKQIINwIEIAAgAzYCAAwBCyABKAIIIgMgASgCBCIETw0BIANBAWoiBSAETw0CIABBfzYCACABKAIAIgQgA2otAAAhBiAEIAVqLQAAIQQgASADQQJqNgIIIAAgBiAEQQh0cjsBBAsgAkEQaiSAgICAAA8LIAMgBEHczMCAABCRhICAAAALIAUgBEHszMCAABCRhICAAAALsQIBB38jgICAgABBEGsiAiSAgICAACACQQRqIAFBBBC0goCAAAJAAkACQAJAAkACQCACKAIEIgNBf0YNACAAIAIpAgg3AgQgACADNgIADAELIAEoAggiAyABKAIEIgRPDQEgA0EBaiIFIARPDQIgA0ECaiIGIARPDQMgA0EDaiIHIARPDQQgASgCACIEIANqLQAAIQggBCAFai0AACEFIABBfzYCACAEIAdqLQAAIQcgBCAGai0AACEEIAEgA0EEajYCCCAAIAggBUEIdHIgBEEQdHIgB0EYdHI2AgQLIAJBEGokgICAgAAPCyADIARB/MzAgAAQkYSAgAAACyAFIARBjM3AgAAQkYSAgAAACyAGIARBnM3AgAAQkYSAgAAACyAHIARBrM3AgAAQkYSAgAAAC8oCAQN/I4CAgIAAQSBrIgMkgICAgAAgA0EUaiABIAIQuYKAgAAgAygCHCECIAMoAhghAQJAAkAgAygCFCIEQX9GDQAgACACNgIMIAAgATYCCCAAIAQ2AgRBASECDAELIANBCGogASACEI6EgIAAIAMo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EEUNACADQQRqIAFBEGogASACIAFBDGogARC+gICAACABKAIMIQQgAygCDCEFIAMoAgQhBiADKAIIIQEMAQsgASgCDCEEQQAhBRCmgICAACIGQQA2AgAgBEEANgIEIAQgBjYCACAGQQE7AY4CIAYgASkCADcCBCAGIAEoAgg2AgwgBiACKQIANwKIASAGIAIoAgg2ApABQQAhAQsgACAENgIMIAAgBTYCCCAAIAE2AgQgACAGNgIAIAQgBCgCCEEBajYCCCADQRBqJICAgIAAC6UCAwN/AX4CfyOAgICAAEEQayIFJICAgIAAQQEhBkEEIQcCQAJAIAStIAKtfiIIQiCIpw0AIAinIgJBgICAgHggA2tLDQBBACEHIAVBDGohCQJAAkAgBEUNACABKAIAIgpFDQAgBSADNgIMIAogBGwhByABKAIEIQQgBUEIaiEJDAELCyAJIAc2AgACQAJAAkACQAJAIAUoAgxFDQACQCAFKAIIIgcNACACDQIgAyEEDAMLIAQgByADIAIQtYOAgAAhBAwCCyACDQAgAyEEDAILELeDgIAAIAIgAxCzg4CAACEECyAEDQAgACADNgIEDAELIAAgBDYCBEEAIQYLQQghBwwBC0EAIQILIAAgB2ogAjYCACAAIAY2AgAgBUEQaiSAgICAAAvJAQEEfyOAgICAAEEQayICJICAgIAAAkACQCABKAIERQ0AIAJBBGogAUEEaiABLwEQIAEgARDAgICAACABKAIAIQMgAigCDCEEIAIoAgQhBSACKAIIIQEMAQsgASgCACEDQQAhBBCHgICAACIFQQA2AgAgA0EANgIEIAMgBTYCACAFIAEvARA7AQggBUEBOwEGQQAhAQsgACADNgIMIAAgBDYCCCAAIAE2AgQgACAFNgIAIAMgAygCCEEBajYCCCACQRBqJICAgIAAC9IBAQR/I4CAgIAAQRBrIgMkgICAgAACQAJAIAEoAgRFDQAgA0EEaiABQQRqIAEvARAgAiABIAEQwYCAgAAgASgCACEEIAMoAgwhBSADKAIEIQYgAygCCCEBDAELIAEoAgAhBEEAIQUQp4CAgAAiBkEANgIAIARBADYCBCAEIAY2AgAgBiABLwEQOwE0IAZBATsBMiAGIAI2AgRBACEBCyAAIAQ2AgwgACAFNgIIIAAgATYCBCAAIAY2AgAgBCAEKAII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gICAADYCnAEgCCAIQYwBajYCoAEgCCAIQYABajYCmAEgCEE4akH8sMCAACAIQZgBahD3g4CAACAIQYwBakEBQQEQiYCAgAAMAQsgCUEEaigCACIAIB9PDQIgCEGMAWogDRD6gYCAACAIQYGAgIAANgKkASAIQYeAgIAANgKcASAIIB4gAEGoAmxqQZACajYCmAEgCCAIQYwBajYCoAEgCEE4akH5sMCAACAIQZgBahD3g4CAACAIQYwBakEBQQEQiYCAgAALIAgoAjwhAwJAAkACQCAIKAJAIgAgBigCACIFIAJrTQ0AIAYgAiAAQQFBARCSgICAACAGKAIEIQEgBigCCCECDAELIABFDQELAkAgAEUNACABIAJqIAMgAPwKAAALIAYoAgAhBQsgBiACIABqIgI2AgggCEHQAGogCxD6gYCAACAIQdwAaiAOEPqBgIAAIAhB6ABqIA8Q+oGAgAAgCEH0AGogCxD6gYCAACAIQYABaiASIASSEPqBgIAAIAhBjAFqIAoQ+oGAgAAgCEGBgICAADYCxAEgCEGBgICAADYCvAEgCEGBgICAADYCtAEgCEGBgICAADYCrAEgCEGBgICAADYCpAEgCEGBgICAADYCnAEgCCAIQYwBajYCwAEgCCAIQYABajYCuAEgCCAIQfQAajYCsAEgCCAIQegAajYCqAEgCCAIQdwAajYCoAEgCCAIQdAAajYCmAEgCEHEAGpBsLDAgAAgCEGYAWoQ94OAgAAgCEGMAWpBAUEBEImAgIAAIAhBgAFqQQFBARCJgICAACAIQfQAakEBQQEQiYCAgAAgCEHoAGpBAUEBEImAgIAAIAhB3ABqQQFBARCJgICAACAIQdAAakEBQQEQiYCAgAAgCCgCSCEDAkACQAJAIAgoAkwiACAFIAJrTQ0AIAYgAiAAQQFBARCSgICAACAGKAIAIQUgBigCCCECDAELIABFDQELIAYoAgQhASAARQ0AIAEgAmogAyAA/AoAAAsgBiACIABqIgI2AgggCEHEAGpBAUEBEImAgIAAIAhBmAFqIAlBDGooAgAgCUEQaigCABD3goCAACAIQYGAgIAANgKEASAIIAhBmAFqNgKAASAIQYwBakHisMCAACAIQYABahD3g4CAACAIQZgBakEBQQEQiYCAgAAgCCgCkAEhAwJAAkACQCAIKAKUASIAIAUgAmtNDQAgBiACIABBAUEBEJKAgIAAIAYoAgghAgwBCyAARQ0BCyAGKAIEIQEgAEUNACABIAJqIAMgAPwKAAALIAYgAiAAaiICNgIIIAhBjAFqQQFBARCJgICAACAJQRRqKAIAIQAgCEE4akEBQQEQiYCAgAAgBCANIACzQwAAekSVlJIhBCAJQRhqIgkgB0cNAAwDCwsgACAfQeTcwIAAEJGEgIAAAAsgCCAcNgJ4IAggFzYCdCAIQYwBaiANEPqBgIAAIAhBgYCAgAA2AqQBIAhBjYCAgAA2ApwBIAggCEGMAWo2AqABIAggCEH0AGo2ApgBIAhBgAFqQfywwIAAIAhBmAFqEPeDgIAAIAhBjAFqQQFBARCJgICAACAIKAKEASEFAkACQAJAIAgoAogBIgkgBigCACIAIAJrTQ0AIAYgAiAJQQFBARCSgICAACAGKAIAIQAgBigCBCEBIAYoAgghAgwBCyAJRQ0BCyAJRQ0AIAEgAmogBSAJ/AoAAAsgBiACIAlqIgI2AgggCEGAAWpBAUEBEImAgIAAIAhB0ABqIAsQ+oGAgAAgCEHcAGogDhD6gYCAACAIQegAaiAPEPqBgIAAIAhB9ABqIAsQ+oGAgAAgCEGAAWogEhD6gYCAACAIQYwBaiAKEPqBgIAAIAhBgYCAgAA2AsQBIAhBgYCAgAA2ArwBIAhBgYCAgAA2ArQBIAhBgYCAgAA2AqwBIAhBgYCAgAA2AqQBIAhBgYCAgAA2ApwBIAggCEGMAWo2AsABIAggCEGAAWo2ArgBIAggCEH0AGo2ArABIAggCEHoAGo2AqgBIAggCEHcAGo2AqABIAggCEHQAGo2ApgBIAhBxABqQbCwwIAAIAhBmAFqEPeDgIAAIAhBjAFqQQFBARCJgICAACAIQYABakEBQQEQiYCAgAAgCEH0AGpBAUEBEImAgIAAIAhB6ABqQQFBARCJgICAACAIQdwAakEBQQEQiYCAgAAgCEHQAGpBAUEBEImAgIAAIAgoAkghBQJAAkACQCAIKAJMIgkgACACa00NACAGIAIgCUEBQQEQkoCAgAAgBigCBCEBIAYoAgghAgwBCyAJRQ0BCwJAIAlFDQAgASACaiAFIAn8CgAACyAGKAIAIQALIAYgAiAJaiICNgIIIAhBxABqQQFBARCJgICAACAIQZgBaiAaIBgQ94KAgAAgCEGBgICAADYChAEgCCAIQZgBajYCgAEgCEGMAWpB4rDAgAAgCEGAAWoQ94OAgAAgCEGYAWpBAUEBEImAgIAAIAgoApABIQUCQAJAAkAgCCgClAEiCSAAIAJrTQ0AIAYgAiAJQQFBARCSgICAACAGKAIIIQIMAQsgCUUNAQsgCUUNACAGKAIEIAJqIAUgCfwKAAALIAYgAiAJaiICNgIIIAhBjAFqQQFBARCJgICAAAsCQCAGKAIAIAJrQQJLDQAgBiACQQNBAUEBEJKAgIAAIAYoAgghAgsgBiACQQNqIgk2AgggBigCBCACaiIAQQAvALzcwIAAOwAAIABBAC0AvtzAgAA6AAIgFCASkiISIBFfDQALCyATIAqSIgogEF8NAAsLAkAgBigCACAJa0EBSw0AIAYgCUECQQFBARCSgICAACAGKAIIIQkLIAYgCUECajYCCCAGKAIEIAlqQdEUOwAAIAhBLGoQ6oCAgAAgCEEgakEBQQEQiYCAgAAgCEEUakEBQQEQiYCAgAAgCEEIakEBQQEQiYCAgAALIAhB0AFqJICAgIAAC9gbBwF/BH0BfwR9AX8BfQV/I4CAgIAAQcABayIHJICAgIAAIAdBoAFqIAAgASACIAMgBCAFEO+CgIAAAkAgBy0AsQEiA0ECRg0AIActALABIQEgByoCrAEhCCAHKgKoASEJIAcqAqQBIQogByAHKgKgASILOAIEIAcgCjgCCCAHIAk4AgwgByAIOAIQIAdBFGogAiAJIAggASADQQFxEPCCgIAAIAIoAhRFDQAgAkEYaiEMIAIqAmQhDSACKgJgIQ4gAioCXCEPAkACQCABDQBDAAAAACEQIA5DAAAAACADQQFxGyEODAELIAIqAlghEAJAIANBAXENAEMAAAAAIQ4MAQsgAkHYAGohAEEAIQMCQAJAA0AgA0EQRg0BIAAgA2ohASADQQRqIQMgASoCAEMAAAAAXg0AC0EAIREMAQtBACERAkAgECAPk4tDCtcjPF0NAAwBCyAPIA6Ti0MK1yM8XUUNACAQQwAAQD+UIRIgDiANk4tDCtcjPF0hEQsgAkHoAGohAUEAIQMgAi0AaCITQf8BcSEAAkADQCADIhRBBEYNASAUQQFqIQMgASAUai0AACAARg0ACwsgByAMKQIINwOoASAHIAwpAgA3A6ABQRghFSACQRhqIRYCQANAIBVB2ABGDQEgFUEQaiEVQQAhACAHQaABaiEDIBYhAQJAA0AgACIXQQRGDQEgF0EBaiEAIAMqAgAhBSABKgIAIQQgA0EEaiEDIAFBBGohASAEIAWTi0MK1yM8XQ0ACwsgFkEQaiEWIBdBA00NAgwACwsgFEEERw0AIBEgBygCFHFFDQAgAioCICEEIAIqAhwhDiACKgIYIQ8CQCACKgIkIgVDAAAAAF4gBUN3vn8/XXEiAUUNACAGQbzBwIAAQQIQmYKAgAAgB0H//wMgBUMAAHpElBDShICAACIF/AFBACAFQwAAAABgGyAFQwD/f0deGzsBTCAHQYSAgIAANgI0IAcgB0HMAGo2AjAgB0GgAWpBnoDAgAAgB0EwahD3g4CAACAHQYGAgIAANgJQIAcgB0GgAWo2AkwgB0EwakGkr8CAACAHQcwAahDigoCAACAHQaABakEBQQEQiYCAgAAgBiAHKAI0IAcoAjgQmYKAgAAgB0EwakEBQQEQiYCAgAALIAdBGGohAwJAAkACQCATQf8BcQ0AIAdBlAFqIA8Q+oGAgAAgB0HMAGogDhD6gYCAACAHQTBqIAQQ+oGAgAAgB0GBgICAADYCtAEgB0GBgICAADYCrAEgB0GBgICAADYCpAEgByAHQTBqNgKwASAHIAdBzABqNgKoASAHIAdBlAFqNgKgASAHQYgBakHssMCAACAHQaABahDigoCAACAHQTBqQQFBARCJgICAACAHQcwAakEBQQEQiYCAgAAgB0GUAWpBAUEBEImAgIAAIAYgBygCjAEgBygCkAEQmYKAgAAgB0GIAWpBAUEBEImAgIAAIAYgCyAKIAkgCCADEPmBgIAAQwAAAAAgCSASIBKSIgSTIgUgBSAFXBsiBUMAAAAAIAVDAAAAAF4bIglDCtcjPF5FDQFDAAAAACAIIASTIgUgBSAFXBsiBUMAAAAAIAVDAAAAAF4bIgVDCtcjPF5FDQEgCiASkiEEIAsgEpIhCiAHQTBqIAMgEhDxgoCAAAJAIAcoAjBBAUcNACAGIAogBCAJIAUgB0E0ahD5gYCAAAwCCyAHQfwAaiAKEPqBgIAAIAdBiAFqIAQQ+oGAgAAgB0GUAWogCRD6gYCAACAHQcwAaiAFEPqBgIAAIAdBgYCAgAA2ArwBIAdBgYCAgAA2ArQBIAdBgYCAgAA2AqwBIAdBgYCAgAA2AqQBIAcgB0HMAGo2ArgBIAcgB0GUAWo2ArABIAcgB0GIAWo2AqgBIAcgB0H8AGo2AqABIAdB8ABqQcWxwIAAIAdBoAFqEOKCgIAAIAdBzABqQQFBARCJgICAACAHQZQBakEBQQEQiYCAgAAgB0GIAWpBAUEBEImAgIAAIAdB/ABqQQFBARCJgICAACAGIAcoAnQgBygCeBCZgoCAACAHQfAAakEBQQEQiYCAgAAMAQsgB0GIAWogDxD6gYCAACAHQZQBaiAOEPqBgIAAIAdBzABqIAQQ+oGAgAAgB0EwaiASEPqBgIAAIAdBgYCAgAA2ArwBIAdBgYCAgAA2ArQBIAdBgYCAgAA2AqwBIAdBgYCAgAA2AqQBIAcgB0EwajYCuAEgByAHQcwAajYCsAEgByAHQZQBajYCqAEgByAHQYgBajYCoAEgB0H8AGpBkq/AgAAgB0GgAWoQ4oKAgAAgB0EwakEBQQEQiYCAgAAgB0HMAGpBAUEBEImAgIAAIAdBlAFqQQFBARCJgICAACAHQYgBakEBQQEQiYCAgAAgBiAHKAKAASAHKAKEARCZgoCAACAHQfwAakEBQQEQiYCAgAAgBiATIBIQ/IGAgAAgBiALIAogCSAIIAMQ+YGAgAAgBkGf4MCAAEECEJmCgIAAIAZBxMHAgABBBxCZgoCAAAwBCyAGQZzgwIAAQQMQmYKAgAALIAFFDQEgBkHCwcCAAEECEJmCgIAADAELIAcgCiAIkjgCKCAHIAsgCZI4AiwgByAHQRBqNgJIIAcgB0EIajYCRCAHIAdBLGo2AkAgByAHQQxqNgI8IAcgB0EoajYCOCAHIAdBBGo2AjQgByAHQRRqNgIwIAcgB0EQajYCYCAHIAdBCGo2AlwgByAHQSxqNgJYIAcgB0EMajYCVCAHIAdBKGo2AlAgByAHQQRqNgJMAkACQAJAIAItAGgiAw0AIAcoAhQNASAHQcwAakEAIBAgDCAGEP2BgIAADAILIAdB8ABqIAsQ+oGAgAAgB0H8AGogByoCKBD6gYCAACAHQYgBaiAHKgIsEPqBgIAAIAdBlAFqIAcqAigQ+oGAgAAgB0GBgICAADYCvAEgB0GBgICAADYCtAEgB0GBgICAADYCrAEgB0GBgICAADYCpAEgByAHQZQBajYCuAEgByAHQYgBajYCsAEgByAHQfwAajYCqAEgByAHQfAAajYCoAEgB0HkAGpBoLLAgAAgB0GgAWoQ94OAgAAgB0GUAWpBAUEBEImAgIAAIAdBiAFqQQFBARCJgICAACAHQfwAakEBQQEQiYCAgAAgB0HwAGpBAUEBEImAgIAAIBAgAyAMIAcoAmggBygCbCAGEPuBgIAAIAdB5ABqQQFBARCJgICAAAwBCyAHQTBqQQAgECAMIAYQ+IGAgAALAkACQCACLQBpIgMNACACQShqIQMCQCAHKAIUDQAgB0HMAGpBASAPIAMgBhD9gYCAAAwCCyAHQTBqQQEgDyADIAYQ+IGAgAAMAQsgB0HwAGogByoCLBD6gYCAACAHQfwAaiAHKgIoEPqBgIAAIAdBiAFqIAcqAiwQ+oGAgAAgB0GUAWogChD6gYCAACAHQYGAgIAANgK8ASAHQYGAgIAANgK0ASAHQYGAgIAANgKsASAHQYGAgIAANgKkASAHIAdBlAFqNgK4ASAHIAdBiAFqNgKwASAHIAdB/ABqNgKoASAHIAdB8ABqNgKgASAHQeQAakGgssCAACAHQaABahD3g4CAACAHQZQBakEBQQEQiYCAgAAgB0GIAWpBAUEBEImAgIAAIAdB/ABqQQFBARCJgICAACAHQfAAakEBQQEQiYCAgAAgDyADIAJBKGogBygCaCAHKAJsIAYQ+4GAgAAgB0HkAGpBAUEBEImAgIAACwJAAkAgAi0AaiIDDQAgAkE4aiEDAkAgBygCFA0AIAdBzABqQQIgDiADIAYQ/YGAgAAMAgsgB0EwakECIA4gAyAGEPiBgIAADAELIAdB8ABqIAsQ+oGAgAAgB0H8AGogChD6gYCAACAHQYgBaiAHKgIsEPqBgIAAIAdBlAFqIAoQ+oGAgAAgB0GBgICAADYCvAEgB0GBgICAADYCtAEgB0GBgICAADYCrAEgB0GBgICAADYCpAEgByAHQZQBajYCuAEgByAHQYgBajYCsAEgByAHQfwAajYCqAEgByAHQfAAajYCoAEgB0HkAGpBoLLAgAAgB0GgAWoQ94OAgAAgB0GUAWpBAUEBEImAgIAAIAdBiAFqQQFBARCJgICAACAHQfwAakEBQQEQiYCAgAAgB0HwAGpBAUEBEImAgIAAIA4gAyACQThqIAcoAmggBygCbCAGEPuBgIAAIAdB5ABqQQFBARCJgICAAAsCQCACLQBrIgMNACACQcgAaiEDAkAgBygCFA0AIAdBzABqQQMgDSADIAYQ/YGAgAAMAgsgB0EwakEDIA0gAyAGEPiBgIAADAELIAdB8ABqIAsQ+oGAgAAgB0H8AGogByoCKBD6gYCAACAHQYgBaiALEPqBgIAAIAdBlAFqIAoQ+oGAgAAgB0GBgICAADYCvAEgB0GBgICAADYCtAEgB0GBgICAADYCrAEgB0GBgICAADYCpAEgByAHQZQBajYCuAEgByAHQYgBajYCsAEgByAHQfwAajYCqAEgByAHQfAAajYCoAEgB0HkAGpBoLLAgAAgB0GgAWoQ94OAgAAgB0GUAWpBAUEBEImAgIAAIAdBiAFqQQFBARCJgICAACAHQfwAakEBQQEQiYCAgAAgB0HwAGpBAUEBEImAgIAAIA0gAyACQcgAaiAHKAJoIAcoAmwgBhD7gYCAACAHQeQAakEBQQEQiYCAgAALIAdBwAFqJICAgIAAC3QBAX8jgICAgABBEGsiAiSAgICAACACIAEoAgQgASgCCBCBgICAAAJAAkAgAigCBEUNACAAIAEQ+IOAgAAMAQsgAkGHgICAADYCDCACIAFBPGo2AgggAEGVgMCAACACQQhqEPeDgIAACyACQRBqJICAgIAAC4MDBAF/AX0BfwJ9QQAhBAJAIAEoAmxBAUcNAEMAAAAAIAEqAnhDAABAP5QiBSAFIAVcGyIFQwAAAAAgBUMAAAAAXhsiBSAFIAMgAiACIAJcGyICIAIgAyADIANcGyIDIAIgA10bQwAAAD+UIgMgAyADXCIGGyICIAUgAl0bIQVDAAAAACABKgJ0QwAAQD+UIgIgAiACXBsiAkMAAAAAIAJDAAAAAF4bIgIgAiADIAYbIgcgAiAHXRshB0MAAAAAIAEqAnBDAABAP5QiAiACIAJcGyICQwAAAAAgAkMAAAAAXhsiAiACIAMgBhsiCCACIAhdGyEIAkBDAAAAACABKgJ8QwAAQD+UIgIgAiACXBsiAkMAAAAAIAJDAAAAAF4bIgIgAiADIAYbIgMgAiADXRsiA0MAAAAAX0UNACAFQwAAAABfRQ0AIAdDAAAAAF9FDQAgCEMAAAAAXw0BCyAAIAM4AhAgACAFOAIMIAAgBzgCCCAAIAg4AgRBASEECyAAIAQ2AgALtQMBBn0CQAJAIAEoAogBQQFGDQBDAAAAPyEHQwAAAAAhCEMAAAA/IQkgBiEKIAUhC0MAAAAAIQwMAQsgAigCFLNDAACAP5dDAABAP5QhCiACKAIQs0MAAIA/l0MAAEA/lCELAkACQAJAAkACQCABLQCgAUF/ag4EAAEEAgMLIAogBiAKlSIHIAUgC5UiCCAIIAhcGyIIIAggByAHIAdcGyIHIAggB10bIgeUIQogCyAHlCELDAMLIAogBiAKlSIHIAUgC5UiCCAIIAhcGyIIIAggByAHIAdcGyIHIAggB14bIgeUIQogCyAHlCELDAILIApDAACAPyAGIAqVIgcgBSALlSIIIAggCFwbIgggCCAHIAcgB1wbIgcgCCAHXRsiByAHIAdcGyIHQwAAgD8gB0MAAIA/XRsiB5QhCiALIAeUIQsMAQsgBiEKIAUhCwsgASoCnAFDAABAP5QhCCABKgKUAUMAAEA/lCEMIAEqApgBIQcgASoCkAEhCQsgACAKOAIMIAAgCzgCCCAAIARDAACAPyAHkyAGIAqTlJIgCJM4AgQgACAMIAMgCSAFIAuTlJKSOAIAC5YBAQF/I4CAgIAAQSBrIgckgICAgAAgB0EIaiAFIAZBABD6goCAAAJAIAcoAhAiBkUNACAAIAEgAiADIAQgBygCDCIFIAYQ+4KAgAAiBEUNACAHQRRqIAAgBCgCkAJBfmogBSAGQQEQrYKAgAAgB0EUakEEQRQQiYCAgAALIAdBCGpBAUEBEImAgIAAIAdBIGokgICAgAALjwMEAX8CfQJ/AX0CQAJAAkACQCADIAAoAsQCIghPDQAgAyACTw0BIAAoAsACIANBrAJsaiIIKgKYAiIJIAgqAqACkiEKAkACQAJAIAEgA0EMbGoiCCgCCCILRQ0AIAtBAnQhDCAIKAIEIQsDQCAAIAEgAiALKAIAIgggBCAFIAYgBxCEg4CAACAIIAVPDQIgCCAHTw0DIAtBBGohCyAGIAhBAnQiCGoqAgAiDSAKIAogClwbIgogCiANIA0gDVwbIg0gCiANXhshCiAEIAhqKgIAIg0gCSAJIAlcGyIJIAkgDSANIA1cGyINIAkgDV0bIQkgDEF8aiIMDQALCyADIAVPDQQgBCADQQJ0IghqIAk4AgAgAyAHSQ0FIAMgB0H04cCAABCRhICAAAALIAggBUGE4sCAABCRhICAAAALIAggB0GU4sCAABCRhICAAAALIAMgCEHE4cCAABCRhICAAAALIAMgAkHU4cCAABCRhICAAAALIAMgBUHk4cCAABCRhICAAAALIAYgCGogCjgCAAvCBwMDfwJ9AX8jgICAgABBIGsiBCSAgICAACAEQQA2AgwgBEKAgICAEDcCBCAEQQRqQQBBAkEBQQEQkoCAgAAgBCgCCCIFIAQoAgwiBmpB8RQ7AAAgBCAGQQJqIgY2AgxDAAAAACACIAEgASABXBsiByAHIAIgAiACXBsiCCAHIAhdG0MAAAA/lEMAAAC/kiIHIAcgB1wbIgdDAAAAACAHQwAAAABeGyEHAkAgBCgCBCAGa0EVSw0AIARBBGogBkEWQQFBARCSgICAACAEKAIIIQUgBCgCDCEGCyAFIAZqIgVBACkAwuLAgAA3AA4gBUEAKQC84sCAADcACCAFQQApALTiwIAANwAAIAQgBkEWajYCDCAEIAc4AhwgBCAHOAIYIAQgBzgCFCAEIAc4AhAgBEEEakMAAAAAIAFDAAAAP5QiCCAHkyIBIAEgAVwbIgFDAAAAACABQwAAAABeG0MAAAAAIAJDAAAAP5QiASAHkyICIAIgAlwbIgJDAAAAACACQwAAAABeG0MAAAAAIAcgB5IiAiACIAJcGyICQwAAAAAgAkMAAAAAXhsiAiACIARBEGoQ+YGAgAACQCAEKAIEIgUgBCgCDCIGa0EBSw0AIARBBGogBkECQQFBARCSgICAACAEKAIEIQUgBCgCDCEGCyAEKAIIIgkgBmpBwhQ7AAAgBCAGQQJqIgY2AgwCQCADRQ0AIAdDAAAAP5QhBwJAIAUgBmtBCEsNACAEQQRqIAZBCUEBQQEQkoCAgAAgBCgCCCEJIAQoAgwhBgsgCSAGaiIFQQAtANLiwIAAOgAIIAVBACkAyuLAgAA3AAAgBCAGQQlqNgIMIAQgBzgCHCAEIAc4AhggBCAHOAIUIAQgBzgCECAEQQRqQwAAAAAgCCAHkyICIAIgAlwbIgJDAAAAACACQwAAAABeG0MAAAAAIAEgB5MiAiACIAJcGyICQwAAAAAgAkMAAAAAXhtDAAAAACAHIAeSIgcgByAHXBsiB0MAAAAAIAdDAAAAAF4bIgcgByAEQRBqEPmBgIAAAkAgBCgCBCIFIAQoAgwiBmtBAUsNACAEQQRqIAZBAkEBQQEQkoCAgAAgBCgCBCEFIAQoAgwhBgsgBCgCCCIJIAZqQeYUOwAAIAQgBkECaiIGNgIMCwJAIAUgBmtBAUsNACAEQQRqIAZBAkEBQQEQkoCAgAAgBCgCCCEJIAQoAgwhBgsgCSAGakHRFDsAACAAIAZBAmoiBjYCCCAAIAQpAgQ3AgAgBCAGNgIMIARBIGokgICAgAAL+wsCBn8BfSOAgICAAEGQAWsiBCSAgICAACAEQQA2AgggBEKAgICAEDcCACAEQQBBAkEBQQEQkoCAgAAgBCgCBCIFIAQoAggiBmpB8RQ7AAAgBCAGQQJqIgc2AggCQCAEKAIAIgYgB2tBCEsNACAEIAdBCUEBQQEQkoCAgAAgBCgCACEGIAQoAgQhBSAEKAIIIQcLIAUgB2oiCEEALQDb4sCAADoACCAIQQApANPiwIAANwAAIAQgB0EJaiIINgIIIARByABqIAEQ+oGAgAAgBEHUAGogAhD6gYCAACAEQYGAgIAANgJsIARBgYCAgAA2AmQgBCAEQdQAajYCaCAEIARByABqNgJgIARBPGpBorHAgAAgBEHgAGoQ94OAgAAgBEHUAGpBAUEBEImAgIAAIARByABqQQFBARCJgICAACAEKAJAIQkCQAJAAkAgBCgCRCIHIAYgCGtNDQAgBCAIIAdBAUEBEJKAgIAAIAQoAgQhBSAEKAIIIQgMAQsgB0UNAQsCQCAHRQ0AIAUgCGogCSAH/AoAAAsgBCgCACEGCyAEIAggB2oiBzYCCCAEQTxqQQFBARCJgICAAAJAIAYgB2tBDEsNACAEIAdBDUEBQQEQkoCAgAAgBCgCACEGIAQoAgghBwsgBCgCBCIFIAdqIghBACkA3OLAgAA3AAAgCEEAKQDh4sCAADcABSAEIAdBDWoiCDYCCCAEQcgAakMAAAAAIAFDAACAv5IiCiAKIApcGyIKQwAAAAAgCkMAAAAAXhsQ+oGAgAAgBEHUAGpDAAAAACACQwAAgL+SIgogCiAKXBsiCkMAAAAAIApDAAAAAF4bEPqBgIAAIARBgYCAgAA2AmwgBEGBgICAADYCZCAEIARB1ABqNgJoIAQgBEHIAGo2AmAgBEE8akHOssCAACAEQeAAahD3g4CAACAEQdQAakEBQQEQiYCAgAAgBEHIAGpBAUEBEImAgIAAIAQoAkAhCQJAAkACQCAEKAJEIgcgBiAIa00NACAEIAggB0EBQQEQkoCAgAAgBCgCACEGIAQoAgQhBSAEKAIIIQgMAQsgB0UNAQsgB0UNACAFIAhqIAkgB/wKAAALIAQgCCAHaiIHNgIIIARBPGpBAUEBEImAgIAAAkAgA0UNAAJAIAYgB2tBDksNACAEIAdBD0EBQQEQkoCAgAAgBCgCACEGIAQoAgQhBSAEKAIIIQcLIAUgB2oiCEEAKQDp4sCAADcAACAIQQApAPDiwIAANwAHIAQgB0EPaiIINgIIIARBGGogAUOuR2E+lBD6gYCAACAEQSRqIAJDuB4FP5QQ+oGAgAAgBEEwaiABQz0K1z6UEPqBgIAAIARBPGogAkO4HoU+lBD6gYCAACAEQcgAaiABQxSuRz+UEPqBgIAAIARB1ABqIAJDpHA9P5QQ+oGAgAAgBEGBgICAADYCjAEgBEGBgICAADYChAEgBEGBgICAADYCfCAEQYGAgIAANgJ0IARBgYCAgAA2AmwgBEGBgICAADYCZCAEIARB1ABqNgKIASAEIARByABqNgKAASAEIARBPGo2AnggBCAEQTBqNgJwIAQgBEEkajYCaCAEIARBGGo2AmAgBEEMakGzssCAACAEQeAAahD3g4CAACAEQdQAakEBQQEQiYCAgAAgBEHIAGpBAUEBEImAgIAAIARBPGpBAUEBEImAgIAAIARBMGpBAUEBEImAgIAAIARBJGpBAUEBEImAgIAAIARBGGpBAUEBEImAgIAAIAQoAhAhAwJAAkACQCAEKAIUIgcgBiAIa00NACAEIAggB0EBQQEQkoCAgAAgBCgCBCEFIAQoAgghCAwBCyAHRQ0BCwJAIAdFDQAgBSAIaiADIAf8CgAACyAEKAIAIQYLIAQgCCAHaiIHNgIIIARBDGpBAUEBEImAgIAACwJAIAYgB2tBAUsNACAEIAdBAkEBQQEQkoCAgAAgBCgCCCEHCyAAIAQpAgA3AgAgBCgCBCAHakHRFDsAACAAIAdBAmoiBjYCCCAEIAY2AgggBEGQAWokgICAgAAL6QQBA38jgICAgABBsAFrIgYkgICAgAACQCABQwAAAABfDQAgAyACXw0AIAZBEGogACoCABD6gYCAACAGQRxqIAAqAgQQ+oGAgAAgBkEoaiAAKgIIEPqBgIAAIAZBNGogARD6gYCAACAGQcAAaiACEPqBgIAAIAZBzABqIAQQ+oGAgAAgBkHYAGogAxD6gYCAACAGQeQAaiAEEPqBgIAAIAZBgYCAgAA2AqwBIAZBgYCAgAA2AqQBIAZBgYCAgAA2ApwBIAZBgYCAgAA2ApQBIAZBgYCAgAA2AowBIAZBgYCAgAA2AoQBIAZBgYCAgAA2AnwgBkGBgICAADYCdCAGIAZB5ABqNgKoASAGIAZB2ABqNgKgASAGIAZBzABqNgKYASAGIAZBwABqNgKQASAGIAZBNGo2AogBIAYgBkEoajYCgAEgBiAGQRxqNgJ4IAYgBkEQajYCcCAGQQRqQY+ywIAAIAZB8ABqEPeDgIAAIAZB5ABqQQFBARCJgICAACAGQdgAakEBQQEQiYCAgAAgBkHMAGpBAUEBEImAgIAAIAZBwABqQQFBARCJgICAACAGQTRqQQFBARCJgICAACAGQShqQQFBARCJgICAACAGQRxqQQFBARCJgICAACAGQRBqQQFBARCJgICAACAGKAIIIQcCQAJAAkAgBigCDCIAIAUoAgAgBSgCCCIIa00NACAFIAggAEEBQQEQkoCAgAAgBSgCCCEIDAELIABFDQELIABFDQAgBSgCBCAIaiAHIAD8CgAACyAFIAggAGo2AgggBkEEakEBQQEQiYCAgAALIAZBsAFqJICAgIAAC7saCAN/BH0Dfwl9AX8GfQR/A30jgICAgABB4AFrIgckgICAgAACQCACKAKsASIIRQ0AIAdBHGogACABIAIgAyAEIAUQ74KAgAAgBy0ALSIJQQJGDQAgByoCICEKIAcqAhwhCyAHQQhqIAIgByoCJCIMIAcqAigiDSAHLQAsIAlBAXEQ8IKAgAAgAigCqAEiDiAIQQV0aiEPIAdBHGpBCGohEANAIA8iCEFgaiEPAkAgCEFsaioCACIRQ28SgzpfDQBDAAAAACAIQXxqKgIAIhIgEiASXBsiEkMAAAAAIBJDAAAAAF4bQwAAQD+UIRMgCEF0aioCAEMAAEC/lCEUIAhBcGoqAgBDAABAP5QhFSAHKgIYIRYgByoCFCEXIAcqAhAhGCAHKgIMIRkgBygCCCEaAkBDAAAAACAIQXhqKgIAIhIgEiASXBsiEkMAAAAAIBJDAAAAAF4bQwAAQD+UIhtDCtcjPF8NACAQQZTCwIAAQeAA/AoAACAKIBSSIRwgCyAVkiEdIAhBaGoqAgAhHiAIQWRqKgIAIR8gDyoCACEgQQAhCANAAkBDAACAP0MAAAAAIBEgB0EcaiAIaiIJQQxqKgIAlCISIBJDAAAAAF0bIhIgEkMAAIA/XhsiFENvEoM6Xw0AIBsgCUEIaioCAJQhEgJAIAYoAgAiISAGKAIIIglrQQFLDQAgBiAJQQJBAUEBEJKAgIAAIAYoAgAhISAGKAIIIQkLIBMgEpIhEiAGIAlBAmoiIjYCCCAGKAIEIiMgCWpB8RQ7AAAgB0H//wMgFEMAAHpElBDShICAACIU/AFBACAUQwAAAABgGyAUQwD/f0deGzsBqAEgB0GEgICAADYCuAEgByAHQagBajYCtAEgB0HAAWpBnoDAgAAgB0G0AWoQ94OAgAAgB0GBgICAADYCrAEgByAHQcABajYCqAEgB0G0AWpBpK/AgAAgB0GoAWoQ94OAgAAgB0HAAWpBAUEBEImAgIAAIAcoArgBISQCQAJAAkAgBygCvAEiCSAhICJrTQ0AIAYgIiAJQQFBARCSgICAACAGKAIAISEgBigCBCEjIAYoAgghIgwBCyAJRQ0BCyAJRQ0AICMgImogJCAJ/AoAAAsgEiASkiEUIAYgIiAJaiIiNgIIIAdBtAFqQQFBARCJgICAACAHQZwBaiAgEPqBgIAAIAdBqAFqIB8Q+oGAgAAgB0G0AWogHhD6gYCAACAHQYGAgIAANgLUASAHQYGAgIAANgLMASAHQYGAgIAANgLEASAHIAdBtAFqNgLQASAHIAdBqAFqNgLIASAHIAdBnAFqNgLAASAHQZABakHssMCAACAHQcABahD3g4CAACAHQbQBakEBQQEQiYCAgAAgB0GoAWpBAUEBEImAgIAAIAdBnAFqQQFBARCJgICAACAHKAKUASEkAkACQAJAIAcoApgBIgkgISAia00NACAGICIgCUEBQQEQkoCAgAAgBigCBCEjIAYoAgghIgwBCyAJRQ0BCyAJRQ0AICMgImogJCAJ/AoAAAsgHCASkyEVIB0gEpMhJSANIBSSISYgDCAUkiEUIAYgIiAJaiIJNgIIIAdBkAFqQQFBARCJgICAAAJAAkAgGkEBRw0AIAdDAAAAACAWIBKSIicgJyAnXBsiJ0MAAAAAICdDAAAAAF4bOALMASAHQwAAAAAgFyASkiInICcgJ1wbIidDAAAAACAnQwAAAABeGzgCyAEgB0MAAAAAIBggEpIiJyAnICdcGyInQwAAAAAgJ0MAAAAAXhs4AsQBIAdDAAAAACAZIBKSIhIgEiASXBsiEkMAAAAAIBJDAAAAAF4bOALAASAGICUgFSAUICYgB0HAAWoQ+YGAgAACQCAGKAIAIAYoAggiImtBAUsNACAGICJBAkEBQQEQkoCAgAAgBigCCCEiCyAGICJBAmoiCTYCCCAGKAIEICJqQeYUOwAADAELIAdBkAFqICUQ+oGAgAAgB0GcAWogFRD6gYCAACAHQagBaiAUEPqBgIAAIAdBtAFqICYQ+oGAgAAgB0GBgICAADYC3AEgB0GBgICAADYC1AEgB0GBgICAADYCzAEgB0GBgICAADYCxAEgByAHQbQBajYC2AEgByAHQagBajYC0AEgByAHQZwBajYCyAEgByAHQZABajYCwAEgB0GEAWpBs7HAgAAgB0HAAWoQ94OAgAAgB0G0AWpBAUEBEImAgIAAIAdBqAFqQQFBARCJgICAACAHQZwBakEBQQEQiYCAgAAgB0GQAWpBAUEBEImAgIAAIAcoAogBISECQAJAAkAgBygCjAEiIiAGKAIAIAlrTQ0AIAYgCSAiQQFBARCSgICAACAGKAIIIQkMAQsgIkUNAQsgIkUNACAGKAIEIAlqICEgIvwKAAALIAYgCSAiaiIJNgIIIAdBhAFqQQFBARCJgICAAAsCQCAGKAIAIAlrQQFLDQAgBiAJQQJBAUEBEJKAgIAAIAYoAgghCQsgBiAJQQJqNgIIIAYoAgQgCWpB0RQ7AAALIAhBCGoiCEHgAEcNAAwCCwtDAACAPyARIBFDAACAP14bIhJDbxKDOl8NAAJAIAYoAgAiISAGKAIIIglrQQFLDQAgBiAJQQJBAUEBEJKAgIAAIAYoAgAhISAGKAIIIQkLIAYgCUECaiIiNgIIIAYoAgQiIyAJakHxFDsAACAHQf//AyASQwAAekSUENKEgIAAIhL8AUEAIBJDAAAAAGAbIBJDAP9/R14bOwG0ASAHQYSAgIAANgLEASAHIAdBtAFqNgLAASAHQRxqQZ6AwIAAIAdBwAFqEPeDgIAAIAdBgYCAgAA2ArgBIAcgB0EcajYCtAEgB0HAAWpBpK/AgAAgB0G0AWoQ94OAgAAgB0EcakEBQQEQiYCAgAAgBygCxAEhJAJAAkACQCAHKALIASIJICEgImtNDQAgBiAiIAlBAUEBEJKAgIAAIAYoAgAhISAGKAIEISMgBigCCCEiDAELIAlFDQELIAlFDQAgIyAiaiAkIAn8CgAACyATIBOSIRIgCiAUkiEUIAsgFZIhESAGICIgCWoiCTYCCCAHQcABakEBQQEQiYCAgAAgB0GoAWogDyoCABD6gYCAACAHQbQBaiAIQWRqKgIAEPqBgIAAIAdBwAFqIAhBaGoqAgAQ+oGAgAAgB0GBgICAADYCMCAHQYGAgIAANgIoIAdBgYCAgAA2AiAgByAHQcABajYCLCAHIAdBtAFqNgIkIAcgB0GoAWo2AhwgB0GcAWpB7LDAgAAgB0EcahD3g4CAACAHQcABakEBQQEQiYCAgAAgB0G0AWpBAUEBEImAgIAAIAdBqAFqQQFBARCJgICAACAHKAKgASEiAkACQAJAIAcoAqQBIgggISAJa00NACAGIAkgCEEBQQEQkoCAgAAgBigCBCEjIAYoAgghCQwBCyAIRQ0BCyAIRQ0AICMgCWogIiAI/AoAAAsgDSASkiEVIAwgEpIhEiAUIBOTIRQgESATkyERIAYgCSAIaiIINgIIIAdBnAFqQQFBARCJgICAAAJAAkAgGkEBRw0AIAdDAAAAACAWIBOSIiUgJSAlXBsiJUMAAAAAICVDAAAAAF4bOAIoIAdDAAAAACAXIBOSIiUgJSAlXBsiJUMAAAAAICVDAAAAAF4bOAIkIAdDAAAAACAYIBOSIiUgJSAlXBsiJUMAAAAAICVDAAAAAF4bOAIgIAdDAAAAACAZIBOSIiUgJSAlXBsiJUMAAAAAICVDAAAAAF4bOAIcIAYgESAUIBIgFSAHQRxqEPmBgIAAAkAgBigCACAGKAIIIglrQQFLDQAgBiAJQQJBAUEBEJKAgIAAIAYoAgghCQsgBiAJQQJqIgg2AgggBigCBCAJakHmFDsAAAwBCyAHQZwBaiAREPqBgIAAIAdBqAFqIBQQ+oGAgAAgB0G0AWogEhD6gYCAACAHQcABaiAVEPqBgIAAIAdBgYCAgAA2AjggB0GBgICAADYCMCAHQYGAgIAANgIoIAdBgYCAgAA2AiAgByAHQcABajYCNCAHIAdBtAFqNgIsIAcgB0GoAWo2AiQgByAHQZwBajYCHCAHQZABakGzscCAACAHQRxqEPeDgIAAIAdBwAFqQQFBARCJgICAACAHQbQBakEBQQEQiYCAgAAgB0GoAWpBAUEBEImAgIAAIAdBnAFqQQFBARCJgICAACAHKAKUASEiAkACQAJAIAcoApgBIgkgBigCACAIa00NACAGIAggCUEBQQEQkoCAgAAgBigCCCEIDAELIAlFDQELIAlFDQAgBigCBCAIaiAiIAn8CgAACyAGIAggCWoiCDYCCCAHQZABakEBQQEQiYCAgAALAkAgBigCACAIa0EBSw0AIAYgCEECQQFBARCSgICAACAGKAIIIQgLIAYgCEECajYCCCAGKAIEIAhqQdEUOwAACyAOIA9HDQALCyAAIAEgAiADIAQgBSAGEO6CgIAAIAAgASACIAMgBCAFIAYQ/4KAgAAgB0HgAWokgICAgAALkAEBA38jgICAgABBEGsiAySAgICAACADQQRqIAJBAEEBQQEQloCAgAAgAygCCCEEAkAgAygCBEEBRg0AIAMoAgwhBQJAIAJFDQAgAkUNACAFIAEgAvwKAAALIABBfzYCYCAAIAI2AgggACAFNgIEIAAgBDYCACADQRBqJICAgIAADwsgBCADKAIMEO+DgIAAAAuUAgEEfyOAgICAAEHAAGsiAiSAgICAACACQQhqIAEQ14CAgAACQAJAAkAgAigCCCIDRQ0AIAMvAQAhBCACQSBqIAEoAhhBAWoiA0F/IAMbIgNBBCADQQRLG0EAQQJBAhCWgICAACACKAIkIQMgAigCIEEBRg0CIAIoAigiBSAEOwEAIAJBATYCHCACIAU2AhggAiADNgIUIAIgASkDGDcDOCACIAEpAxA3AzAgAiABKQMINwMoIAIgASkDADcDICACQRRqIAJBIGoQ3YCAgAAgACACKAIcNgIIIAAgAikCFDcCAAwBCyAAQQA2AgggAEKAgICAIDcCAAsgAkHAAGokgICAgAAPCyADIAIoAigQ74OAgAAAC4kCAQZ/I4CAgIAAQRBrIgIkgICAgAAgASgCCEF/aiEDIAEoAgAhBCABKAIEIQUCQAJAAkADQCAEIAVGDQEgASAEQawCaiIGNgIAIAEgA0ECajYCCCADQQFqIQMgBEGQAmohByAGIQQgBygCAEF/Sg0ACyACQQRqQQRBAEEEQQQQloCAgAAgAigCCCEEIAIoAgRBAUYNAiACKAIMIgYgAzYCACACQQE2AgwgAiAGNgIIIAIgBDYCBCACQQRqIAEQ2YCAgAAgACACKAIMNgIIIAAgAikCBDcCAAwBCyAAQQA2AgggAEKAgICAwAA3AgALIAJBEGokgICAgAAPCyAEIAIoAgwQ74OAgAAAC+0/DgN/An0BfwJ9BX8EfQR/An0DfwJ9BH8DfQV/BX0jgICAgABBsAFrIg8kgICAgAACQAJAAkACQCAJIAAoAsQCIhBPDQAgACgCwAIgCUGsAmxqIhAtAKoCIhFBAkYNAwJAAkAgCSAGTw0AIAUgCUECdGoqAgAgCyAKQQFqs5QiEmBFDQEMBQsgCSAGQdzpwIAAEJGEgIAAAAsgCSAITw0BIAcgCUECdGoqAgAgCyAKs5QiE18NA0EAIRQCQCAQKgKYAiIVIBJdRQ0AIBUgECoCoAKSIBNeIRQLQwAAgD9DAAAAACAQKgKEAUMAAIA/IBAoAoABGyISIBJDAAAAAF0bIhIgEkMAAIA/XhsiFkN3vn8/XUUNAgJAIA0oAgAgDSgCCCIXa0EBSw0AIA0gF0ECQQFBARCSgICAACANKAIIIRcLIA0gF0ECajYCCCANKAIEIBdqQfEUOwAAIA9B//8DIBZDAAB6RJQQ0oSAgAAiEvwBQQAgEkMAAAAAYBsgEkMA/39HXhs7AQggD0GEgICAADYCICAPIA9BCGo2AhwgD0EwakGegMCAACAPQRxqEPeDgIAAIA9BgYCAgAA2AgwgDyAPQTBqNgIIIA9BHGpBpK/AgAAgD0EIahD3g4CAACAPQTBqQQFBARCJgICAACAPKAIgIRgCQAJAAkAgDygCJCIXIA0oAgAgDSgCCCIZa00NACANIBkgF0EBQQEQkoCAgAAgDSgCCCEZDAELIBdFDQELIBdFDQAgDSgCBCAZaiAYIBf8CgAACyANIBkgF2o2AgggD0EcakEBQQEQiYCAgAAMAgsgCSAQQczpwIAAEJGEgIAAAAsgCSAIQezpwIAAEJGEgIAAAAsCQAJAAkACQAJAAkACQCAQLQCpAg4DAQIABgsgFA0DDAULIBFFIBRxDQEMAwsgECgCvAFBf0YNAyAQKAKAAkF/Rg0DIBAqAsgBIRIgECoC1AEhCyAQKgLQASEVIA9BpAFqIBAqAswBEPqBgIAAIA9BCGogFRD6gYCAACAPQRxqIAsQ+oGAgAAgD0GBgICAADYCRCAPQYGAgIAANgI8IA9BgYCAgAA2AjQgDyAPQRxqNgJAIA8gD0EIajYCOCAPIA9BpAFqNgIwIA9B2ABqQeywwIAAIA9BMGoQ94OAgAAgD0EcakEBQQEQiYCAgAAgD0EIakEBQQEQiYCAgAAgD0GkAWpBAUEBEImAgIAAAkAgECgCuAEiGkUNACAQQcwBaiEbIBJDAABAP5QhHCAQKAK0ASIOIBpBBXRqIRggECoC6AEiFUMAAIA/IBJDAACAPZQiCyALIAtcGyILQwAAgD8gC0MAAIA/XhsgFUMAAAAAXhsiFUMAAAA/lCIdIBJDCtejPZQiCyALIAtcGyILIAsgHSAdIB1cGyIeIAsgHl4bIR9B6+DAgABB5+DAgAAgEC0A7wEiIBtB4+DAgABB4ODAgAAgIBsgEC8B7AEiIUG7BUsiCRshIkEFQQQgIBtBBEEDICAbIAkbISMgFUMAAEA/lCEkIBAqAuABIhVDAABAP5RDAAAAACAVQwAAAABcGyElIBAtAKoCIiZBA0YiJyAQKAKAASAQKgKEAUNvEoM6X3FyISggEkOamZk+lCEpIBJDzcxMP5QhKiAQLQDxASIrQQRxISwgK0ECcSEtICtBAXEhLiAMIAAqAugCkyACKgIEkyEvIAAqAvQCITAgASgCJCEXIAEoAighAyAQKgLkASExIBAoAsQBITIgECgCwAEhMyAQKAKEAiE0IBAoAogCIRkgEC0A7gFBAXEhNSAQLQDwAUH/AXFBA0YhNkEAIREDQCARQQFqIRECQCAOKAIYIApHDQAgDigCECIAIBkgDigCFCIJIBkgCUkbIgZPDQACQAJAAkACQAJAAkACQAJAIBkgACAZIABJGyIARQ0AIDQgAGosAABBQEgNAQsCQCAJIBlPDQAgNCAGaiwAAEG/f0wNAQsgD0HkAGogNCAAaiAGIABrIDUQ+oKAgAAgDygCbCIARQ0GIAEgMyAyICEgICAPKAJoIhAgABD7goCAACEFAkACQCAoRQ0AIA9BMGogECAAEPaCgIAAIA8gDygCODYCeCAPIA8pAjA3A3AMAQsgD0F/NgJwCyAOKgIcIA4qAgwgEpNDAAAAP5SSIQsgDygCXCEIAkACQAJAIA8oAmAiCSANKAIAIA0oAggiBmtNDQAgDSAGIAlBAUEBEJKAgIAAIA0oAgghBgwBCyAJRQ0BCyAJRQ0AIA0oAgQgBmogCCAJ/AoAAAsgKiALkiE3IA0gBiAJaiIJNgIIAkAgDygCcEF/Rg0AIA8gD0HwAGo2AgggD0GQgICAADYCICAPIA9BCGo2AhwgD0EwakHBs8CAACAPQRxqEPeDgIAAIA8oAjQhCAJAAkACQCAPKAI4IgkgDSgCACANKAIIIgZrTQ0AIA0gBiAJQQFBARCSgICAACANKAIIIQYMAQsgCUUNAQsgCUUNACANKAIEIAZqIAggCfwKAAALIA0gBiAJajYCCCAPQTBqQQFBARCJgICAACANKAIIIQkLIDcgE5MhCwJAIA0oAgAgCWtBAksNACANIAlBA0EBQQEQkoCAgAAgDSgCCCEJCyARIBpJIQggC0MAAEC/lCELIA0gCUEDaiIGNgIIIA0oAgQgCWoiCUEALwDg3MCAADsAACAJQQAtAOLcwIAAOgACAkACQCAnDQACQCANKAIAIAZrQQRLDQAgDSAGQQVBAUEBEJKAgIAAIA0oAgghBgsgDSgCBCAGaiIJQQAoALTgwIAANgAAIAlBAC0AuODAgAA6AAQMAQsCQCANKAIAIAZrQQRLDQAgDSAGQQVBAUEBEJKAgIAAIA0oAgghBgsgDSgCBCAGaiIJQQAoALngwIAANgAAIAlBAC0AveDAgAA6AAQLIDYgCHEhCCAvIAuSITggDSAGQQVqNgIIIAVFDQEgD0GAAWogASAFKAKQAkF+aiAQIABBABCtgoCAACAPKAKIASIHRQ0DIA8oAoQBIhRBEGohCUEAIQAgByEGA0AgACAJLQAAaiEAIAlBFGohCSAGQX9qIgYNAAsgFEEIaiEJQwAAAIAhCyAHIQYDQCALIBIgCSgCALNDAAB6RJWUkiELIAlBFGohCSAGQX9qIgYNAAsgALMhOUMAAAAAIR5DAAAAACEMAkAgCCAAQQBHcUUNAEMAAAAAIA4qAgggFSAHs5QgMSA5lJIgC5KTIgsgCyALXBsiC0MAAAAAIAtDAAAAAF4bIQwLIDEgDCA5lUMAAAAAIAxDAAAAAF4bQwAAAAAgABuSIgxDAABAP5RDAAAAACAMQwAAAABcGyE6IA4qAgAhO0EAIQYCQANAIBQgBkEUbGoiCSgCACEIIAkoAgQhECAPQQA2ApQBIA9CgICAgBA3AowBIBcgEEGoAmxqIQRBACEAIB4hCwJAAkACQAJAAkACQANAAkACQAJAAkACQCAJKAIAQQFHDQAgCEUNASAJQQRqKAIAIBBHDQcgECADTw0GIAQgCUEOai8BABDlgYCAACICQYD+A3FBCHYhBQJAIA8oApQBIgAgDygCjAFHDQAgD0GMAWoQ84OAgAALIA8oApABIABqIAU6AAAgDyAAQQFqIgU2ApQBAkAgBSAPKAKMAUcNACAPQYwBahDzg4CAAAsgDygCkAEgBWogAjoAACAAQQJqIQAMAwsgCEUNAQwGCyAARQ0GIDAgOyAekkMAAEA/lJIhOQwHCyAJQQxqLQAAQQFHDQEgCUENai0AACEFAkAgACAPKAKMAUcNACAPQYwBahDzg4CAAAsgDygCkAEgAGogBToAACAAQQFqIQALIA8gADYClAELIAwgCyAVIBIgCUEIaigCALNDAAB6RJWUkpIiC5IgCyAJQRBqLQAAGyELIAlBFGohCSAGQQFqIgYgB0kNAAwCCwsgECADQdDgwIAAEJGEgIAAAAsgAEUNACAwIDsgHpJDAABAP5SSITkgCEUNASAQIANPDQUgD0EcaiAcEPqBgIAAIA9BgYCAgAA2AjwgD0GHgICAADYCNCAPIARBkAJqNgIwIA8gD0EcajYCOCAPQZgBakH5sMCAACAPQTBqEPeDgIAAIA9BHGpBAUEBEImAgIAAIAshHgwCCyALIR4MAgsgCyEeIA8gIzYCDCAPICI2AgggD0EcaiAcEPqBgIAAIA9BgYCAgAA2AjwgD0GNgICAADYCNCAPIA9BHGo2AjggDyAPQQhqNgIwIA9BmAFqQfywwIAAIA9BMGoQ94OAgAAgD0EcakEBQQEQiYCAgAALIA8oApwBIQUCQAJAAkAgDygCoAEiCSANKAIAIA0oAggiAGtNDQAgDSAAIAlBAUEBEJKAgIAAIA0oAgghAAwBCyAJRQ0BCyAJRQ0AIA0oAgQgAGogBSAJ/AoAAAsgDSAAIAlqNgIIIA9BMGogJRD6gYCAACAPQYGAgIAANgIMIA8gD0EwajYCCCAPQRxqQeOxwIAAIA9BCGoQ94OAgAAgD0EwakEBQQEQiYCAgAAgDygCICEFAkACQAJAIA8oAiQiCSANKAIAIA0oAggiAGtNDQAgDSAAIAlBAUEBEJKAgIAAIA0oAgghAAwBCyAJRQ0BCyAJRQ0AIA0oAgQgAGogBSAJ/AoAAAsgDSAAIAlqNgIIIA9BHGpBAUEBEImAgIAAIA9BMGogOhD6gYCAACAPQYGAgIAANgIMIA8gD0EwajYCCCAPQRxqQYuvwIAAIA9BCGoQ94OAgAAgD0EwakEBQQEQiYCAgAAgDygCICEFAkACQAJAIA8oAiQiCSANKAIAIA0oAggiAGtNDQAgDSAAIAlBAUEBEJKAgIAAIA0oAgghAAwBCyAJRQ0BCyAJRQ0AIA0oAgQgAGogBSAJ/AoAAAsgDSAAIAlqNgIIIA9BHGpBAUEBEImAgIAAIA9BCGogORD6gYCAACAPQRxqIDgQ+oGAgAAgD0GBgICAADYCPCAPQYGAgIAANgI0IA8gD0EcajYCOCAPIA9BCGo2AjAgD0GkAWpBnbDAgAAgD0EwahD3g4CAACAPQRxqQQFBARCJgICAACAPQQhqQQFBARCJgICAACAPKAKoASEFAkACQAJAIA8oAqwBIgkgDSgCACANKAIIIgBrTQ0AIA0gACAJQQFBARCSgICAACANKAIIIQAMAQsgCUUNAQsgCUUNACANKAIEIABqIAUgCfwKAAALIA0gACAJajYCCCAPQaQBakEBQQEQiYCAgAAgD0EwaiAPKAKQASAPKAKUARD3goCAACAPQYGAgIAANgIMIA8gD0EwajYCCCAPQRxqQeKwwIAAIA9BCGoQ94OAgAAgD0EwakEBQQEQiYCAgAAgDygCICEFAkACQAJAIA8oAiQiCSANKAIAIA0oAggiAGtNDQAgDSAAIAlBAUEBEJKAgIAAIA0oAgghAAwBCyAJRQ0BCyAJRQ0AIA0oAgQgAGogBSAJ/AoAAAsgDSAAIAlqNgIIIA9BHGpBAUEBEImAgIAAIA9BmAFqQQFBARCJgICAAAsgD0GMAWpBAUEBEImAgIAAIAYgB0kNAAsgD0GAAWpBBEEUEImAgIAADAMLIBAgA0HA4MCAABCRhICAAAALIDQgGSAAIAZBpODAgAAQooSAgAAACyAPQZgBaiAQIAAQ6IKAgAACQAJAAkACQCAPKAKgASIGRQ0AQQAhCSAPKAKcASEFQQAhEANAIBAgBSAJai0AAEEBdC8BnLvAgABqIRAgBiAJQQFqIglHDQALQQAhCUEAIQADQCAAIAUgCWotAABBIEZqIQAgBiAJQQFqIglHDQALIACzIQxDAAAAACELAkAgCCAAQQBHcUUNAEMAAAAAIA4qAgggEiAQs0MAAHpElZQgFSAGs5QgMSAMlJKSkyILIAsgC1wbIgtDAAAAACALQwAAAABeGyELCyAOKgIAIR4gDyAjNgKoASAPICI2AqQBIA9BHGogHBD6gYCAACAPQYGAgIAANgI8IA9BjYCAgAA2AjQgDyAPQRxqNgI4IA8gD0GkAWo2AjAgD0EIakH8sMCAACAPQTBqEPeDgIAAIA9BHGpBAUEBEImAgIAAIDEgCyAMlUMAAAAAIAtDAAAAAF4bQwAAAAAgABsiC5JDAABAP5QiDEMAAAAAIAtDAAAAAFwbIQsgDygCDCEQIA8oAhAiCSANKAIAIA0oAggiAGtNDQEgDSAAIAlBAUEBEJKAgIAAIA0oAgghAAwCCwJAIA0oAgAgDSgCCCIJa0ECSw0AIA0gCUEDQQFBARCSgICAACANKAIIIQkLIA0oAgQgCWoiAEEALQC+3MCAADoAAiAAQQAvALzcwIAAOwAAIA0gCUEDaiIJNgIIAkAgDygCcEF/Rg0AAkAgDSgCACAJa0EDSw0AIA0gCUEEQQFBARCSgICAACANKAIIIQkLIA0gCUEEajYCCCANKAIEIAlqQcWajdIANgAACyAPQZgBakEBQQEQiYCAgAAMBQsgCUUNAQsgCUUNACANKAIEIABqIBAgCfwKAAALIB5DAABAP5QhHiAMIAsgMUMAAAAAXBshCyANIAAgCWo2AgggD0EIakEBQQEQiYCAgAAgD0EwaiAlEPqBgIAAIA9BgYCAgAA2AgwgDyAPQTBqNgIIIA9BHGpB47HAgAAgD0EIahD3g4CAACAPQTBqQQFBARCJgICAACAPKAIgIRACQAJAAkAgDygCJCIJIA0oAgAgDSgCCCIAa00NACANIAAgCUEBQQEQkoCAgAAgDSgCCCEADAELIAlFDQELIAlFDQAgDSgCBCAAaiAQIAn8CgAACyAwIB6SIQwgDSAAIAlqNgIIIA9BHGpBAUEBEImAgIAAIA9BMGogCxD6gYCAACAPQYGAgIAANgIMIA8gD0EwajYCCCAPQRxqQYuvwIAAIA9BCGoQ94OAgAAgD0EwakEBQQEQiYCAgAAgDygCICEQAkACQAJAIA8oAiQiCSANKAIAIA0oAggiAGtNDQAgDSAAIAlBAUEBEJKAgIAAIA0oAgghAAwBCyAJRQ0BCyAJRQ0AIA0oAgQgAGogECAJ/AoAAAsgDSAAIAlqNgIIIA9BHGpBAUEBEImAgIAAIA9BCGogDBD6gYCAACAPQRxqIDgQ+oGAgAAgD0GBgICAADYCPCAPQYGAgIAANgI0IA8gD0EcajYCOCAPIA9BCGo2AjAgD0GkAWpBnbDAgAAgD0EwahD3g4CAACAPQRxqQQFBARCJgICAACAPQQhqQQFBARCJgICAACAPKAKoASEQAkACQAJAIA8oAqwBIgkgDSgCACANKAIIIgBrTQ0AIA0gACAJQQFBARCSgICAACANKAIIIQAMAQsgCUUNAQsgCUUNACANKAIEIABqIBAgCfwKAAALIA0gACAJajYCCCAPQaQBakEBQQEQiYCAgAAgD0EwaiAFIAYQ94KAgAAgD0GBgICAADYCDCAPIA9BMGo2AgggD0EcakHisMCAACAPQQhqEPeDgIAAIA9BMGpBAUEBEImAgIAAIA8oAiAhBgJAAkACQCAPKAIkIgkgDSgCACANKAIIIgBrTQ0AIA0gACAJQQFBARCSgICAACANKAIIIQAMAQsgCUUNAQsgCUUNACANKAIEIABqIAYgCfwKAAALIA0gACAJajYCCCAPQRxqQQFBARCJgICAACAPQZgBakEBQQEQiYCAgAALAkAgDSgCACANKAIIIglrQQJLDQAgDSAJQQNBAUEBEJKAgIAAIA0oAgghCQsgDSgCBCAJaiIAQQAtAL7cwIAAOgACIABBAC8AvNzAgAA7AAAgDSAJQQNqIgk2AggCQCAPKAJwQX9GDQACQCANKAIAIAlrQQNLDQAgDSAJQQRBAUEBEJKAgIAAIA0oAgghCQsgDSAJQQRqNgIIIA0oAgQgCWpBxZqN0gA2AAALAkAgJg0AICtFDQAgMCAOKgIAQwAAQD+UkiILIA4qAghDAABAP5SSIQwCQCAuRQ0AIBsgJCALIAwgLyAfIDeSIBOTQwAAQL+UkiANEIeDgIAACwJAIC1FDQAgGyAkIAsgDCAvIDcgKZMgE5NDAABAv5SSIA0Qh4OAgAALICxFDQAgGyAkIAsgDCAvIB0gNyAqk5IgE5NDAABAv5SSIA0Qh4OAgAALIA8oAnBBf0YNAwwCCwJAIA0oAgAgDSgCCCIJa0ECSw0AIA0gCUEDQQFBARCSgICAACANKAIIIQkLIA0oAgQgCWoiAEEALQC+3MCAADoAAiAAQQAvALzcwIAAOwAAIA0gCUEDaiIJNgIIAkAgDygCcEF/Rg0AAkAgDSgCACAJa0EDSw0AIA0gCUEEQQFBARCSgICAACANKAIIIQkLIA0gCUEEajYCCCANKAIEIAlqQcWajdIANgAACyAPQYABakEEQRQQiYCAgAALIA8oAnBBf0YNAQsgD0HwAGpBAUEBEImAgIAACyAPQeQAakEBQQEQiYCAgAALIA5BIGoiDiAYRw0ACwsgD0HYAGpBAUEBEImAgIAADAMLIAAgAiAQIAogCyAMIA0QiIOAgAAMAQsgACACIBAgCiALIAwgDRDugoCAAAJAIBAoAogBQQFHDQAgACgC3AJBHGwhCSAAKALYAkEMaiEGIBBBjAFqIgQoAgAhCANAIAlFDQEgCUFkaiEJIAYoAgAhBSAGQRxqIgchBiAFIAhHDQALIA9BMGogECAHQVhqIAAqAvQCIBAqApQCQwAAQD+UkiI5IAwgACoC6AKTIAIqAgSTIBAqApgCIBOTQwAAQD+UkyAQKgKgAkMAAEA/lCISkyI4IBAqApwCQwAAQD+UIh4gEhCCg4CAACAPKgI8IRwgDyoCOCEwIA8qAjAhFQJAAkAgDyoCNCIlIDhDCtcjvJJdDQAgFSA5QwrXI7ySXQ0AIBAoAmwNACAVIDCSIDkgHpJDCtcjPJJeDQBBACEJICUgHJIgEiA4kkMK1yM8kl5FDQELIA1BvMHAgABBAhCZgoCAACAPQRxqIBAgHiASEIGDgIAAAkACQCAPKAIcQQFHDQAgDSA5IDggHiASIA9BHGpBBGoQ+YGAgAAgDUG+wcCAAEEEEJmCgIAADAELIA9BjAFqIDkQ+oGAgAAgD0GYAWogOBD6gYCAACAPQaQBaiAeEPqBgIAAIA9BCGogEhD6gYCAACAPQYGAgIAANgJMIA9BgYCAgAA2AkQgD0GBgICAADYCPCAPQYGAgIAANgI0IA8gD0EIajYCSCAPIA9BpAFqNgJAIA8gD0GYAWo2AjggDyAPQYwBajYCMCAPQYABakG9r8CAACAPQTBqEOKCgIAAIA9BCGpBAUEBEImAgIAAIA9BpAFqQQFBARCJgICAACAPQZgBakEBQQEQiYCAgAAgD0GMAWpBAUEBEImAgIAAIA0gDygChAEgDygCiAEQmYKAgAAgD0GAAWpBAUEBEImAgIAAC0EBIQkLIA9BmAFqIDAQ+oGAgAAgD0GkAWogHBD6gYCAACAPQQhqIBUQ+oGAgAAgD0EcaiAlEPqBgIAAIA9Bh4CAgAA2AlQgDyAENgJQIA9BgYCAgAA2AkwgD0GBgICAADYCRCAPQYGAgIAANgI8IA9BgYCAgAA2AjQgDyAPQRxqNgJIIA8gD0EIajYCQCAPIA9BpAFqNgI4IA8gD0GYAWo2AjAgD0GMAWpB47LAgAAgD0EwahDigoCAACAPQRxqQQFBARCJgICAACAPQQhqQQFBARCJgICAACAPQaQBakEBQQEQiYCAgAAgD0GYAWpBAUEBEImAgIAAIA0gDygCkAEgDygClAEQmYKAgAAgD0GMAWpBAUEBEImAgIAAAkAgCUUNACANQcLBwIAAQQIQmYKAgAALIA4oAgQiBiAOKAIIIgkgBBCQgoCAAA0AAkAgCSAOKAIARw0AIA4Qn4KAgAAgDigCBCEGCyAOIAlBAWo2AgggBiAJQQJ0aiAINgIACyAAIAIgECAKIAsgDCANEP+CgIAADAELQQAhEQJAIBRFDQAgEC0ApgJFDQAgDUG8wcCAAEECEJmCgIAAIA9BCGogACACIBAgCiALIAwQ74KAgAACQCAPLQAZIhFBAkYNACAPKgIMIRIgDyoCCCEVIA9BHGogECAPKgIQIh4gDyoCFCI5IA8tABggEUEBcRDwgoCAAAJAIA8oAhxFDQAgDSAVIBIgHiA5IA9BHGpBBGoQ+YGAgAAgDUG+wcCAAEEEEJmCgIAADAELIA9BgAFqIBUQ+oGAgAAgD0GMAWogEhD6gYCAACAPQZgBaiAeEPqBgIAAIA9BpAFqIDkQ+oGAgAAgD0GBgICAADYCTCAPQYGAgIAANgJEIA9BgYCAgAA2AjwgD0GBgICAADYCNCAPIA9BpAFqNgJIIA8gD0GYAWo2AkAgDyAPQYwBajYCOCAPIA9BgAFqNgIwIA9B8ABqQb2vwIAAIA9BMGoQ4oKAgAAgD0GkAWpBAUEBEImAgIAAIA9BmAFqQQFBARCJgICAACAPQYwBakEBQQEQiYCAgAAgD0GAAWpBAUEBEImAgIAAIA0gDygCdCAPKAJ4EJmCgIAAIA9B8ABqQQFBARCJgICAAAtBASERCwJAIAkgBE8NAAJAIAMgCUEMbGoiCSgCCCIQRQ0AIBBBAnQhECAJKAIEIQkDQCAAIAEgAiADIAQgBSAGIAcgCCAJKAIAIAogCyAMIA0gDhCMg4CAACAJQQRqIQkgEEF8aiIQDQALCyARRQ0BIA1BwsHAgABBAhCZgoCAAAwBCyAJIARB/OnAgAAQkYSAgAAACyAWQ3e+fz9dRQ0AAkAgDSgCACANKAIIIglrQQFLDQAgDSAJQQJBAUEBEJKAgIAAIA0oAgghCQsgDSAJQQJqNgIIIA0oAgQgCWpB0RQ7AAALIA9BsAFqJICAgIAAC7ACAQV/I4CAgIAAQdAAayICJICAgIAAIAIgAUEgajYCHCACQRBqIAEQ14CAgAACQAJAAkACQCACKAIQIgNFDQADQCACQShqIAJBHGogAxDYgICAACACKAIoDQIgAkEIaiABENeAgIAAIAIoAggiAw0ACwsgAEEANgIIIABCgICAgMAANwIADAELIAIoAjAhBCACLwEsIQUgAkEoakEEQQBBBEEIEJaAgIAAIAIoAiwhBiACKAIoQQFGDQEgAigCMCIDIAQ2AgQgAyAFOwEAIAJBATYCJCACIAM2AiAgAiAGNgIcIAJBKGogAUEo/AoAACACQRxqIAJBKGoQ1oCAgAAgACACKAIkNgIIIAAgAikCHDcCAAsgAkHQAGokgICAgAAPCyAGIAIoAjAQ74OAgAAAC7ACAQV/I4CAgIAAQcAAayICJICAgIAAIAIgAUEgajYCDAJAAkACQAJAIAEoAhhFDQADQCABEMqAgIAAIQMgASABKAIYQX9qIgQ2AhggAkEYaiACQQxqIANBeGogA0F8ahDTgICAACACKAIYDQIgBA0ACwsgAEEANgIIIABCgICAgMAANwIADAELIAIoAiAhBSACKAIcIQYgAkEYakEEQQBBBEEIEJaAgIAAIAIoAhwhBCACKAIYQQFGDQEgAigCICIDIAU2AgQgAyAGNgIAIAJBATYCFCACIAM2AhAgAiAENgIMIAJBGGogAUEo/AoAACACQQxqIAJBGGoQ0oCAgAAgACACKAIUNgIIIAAgAikCDDcCAAsgAkHAAGokgICAgAAPCyAEIAIoAiAQ74OAgAAAC5ABAQN/I4CAgIAAQRBrIgMkgICAgAAgA0EEaiACQQBBAUEBEJaAgIAAIAMoAgghBAJAIAMoAgRBAUYNACADKAIMIQUCQCACRQ0AIAJFDQAgBSABIAL8CgAACyAAIAI2AgwgACAFNgIIIAAgBDYCBCAAQQE2AgAgA0EQaiSAgICAAA8LIAQgAygCDBDvg4CAAAALmgEBAn8jgICAgABBIGsiAiSAgICAACACQRRqIAEoAgQgASgCAGtBAXZBAEEEQQgQloCAgAAgAigCGCEDAkAgAigCFEEBRw0AIAMgAigCHBDvg4CAAAALIAJBADYCECACIAIoAhw2AgwgAiADNgIIIAJBCGogARDUgICAACAAIAIoAhA2AgggACACKQIINwIAIAJBIGokgICAgAALDwAgACgCACABEMWEgIAAC/sBAQV/AkAgACgCICIBDQBBAA8LIAAgAUF/ajYCIAJAIAAQ2oKAgAAiAkUNACACKAIEIQACQAJAAkAgAigCCCIDIAIoAgAiBC8BBk8NACAEIQEMAQsDQCAEKAIAIgFFDQIgAEEBaiEAIAQvAQQhAyABIQQgAyABLwEGTw0ACwsCQAJAIAANACADQQFqIQAgASEFDAELIAEgA0ECdGpBJGohBANAIAQoAgAiBUEgaiEEIABBf2oiAA0AC0EAIQALIAIgADYCCCACQQA2AgQgAiAFNgIAIAEgA0EBdGpBCGoPC0GMu8CAABCmhICAAAALQdjPwIAAEKaEgIAAAAuVAgEJfyOAgICAAEEgayICJICAgIAAIAEoAgQhAyACQQRqIAEoAggiBEEAQQRBHBCWgICAACACKAIIIQUCQCACKAIEQQFGDQAgAigCDCEGAkAgBUUNACAEQRxsIQcgAkEEakEMaiEIIAYhASAFIQkDQCAHRQ0BIAJBBGogAxD4g4CAACAIIANBDGoQ+IOAgAAgAy0AGCEKIAEgAikCBDcCACABIAIpAgw3AgggASACKQIUNwIQIAIgCjoAHCABIAIoAhw2AhggAUEcaiEBIAdBZGohByADQRxqIQMgCUF/aiIJDQALCyAAIAQ2AgggACAGNgIEIAAgBTYCACACQSBqJICAgIAADwsgBSACKAIMEO+DgIAAAAuVAgEDfyOAgICAAEEgayIDJICAgIAAIAFBdGohAQJAAkACQANAIAFBDGogAkYNASABQSRqIQQgAUEcaiIFIQEgBC0AAEEBRw0ACyADQQhqIAUoAgAgBUEEaigCABDRgICAACADKAIIQX9GDQAgA0EUakEEQQBBBEEMEJaAgIAAIAMoAhghBCADKAIUQQFGDQIgAygCHCIBIAMoAhA2AgggASADKQIINwIAIANBATYCHCADIAE2AhggAyAENgIUIANBFGogBUEMaiACENCAgIAAIAAgAygCHDYCCCAAIAMpAhQ3AgAMAQsgAEEANgIIIABCgICAgMAANwIACyADQSBqJICAgIAADwsgBCADKAIcEO+DgIAAAAuWAQECfyOAgICAAEEgayIDJICAgIAAIANBFGogAiABa0EcbkEAQQRBDBCWgICAACADKAIYIQQCQCADKAIUQQFHDQAgBCADKAIcEO+DgIAAAAsgA0EANgIQIAMgAygCHDYCDCADIAQ2AgggA0EIaiABIAIQzICAgAAgACADKAIQNgIIIAAgAykCCDcCACADQSBqJICAgIAAC38BBH8jgICAgABBEGsiASSAgICAACAAKAIMIgIgACgCBCIDa0H0AG4hBAJAIAIgA0YNAANAIAMQ/4CAgAAgA0H0AGohAyAEQX9qIgQNAAsLIAEgACgCADYCDCABIAAoAgg2AgggAUEIakEEQfQAEImAgIAAIAFBEGokgICAgAALoAIBBX8CQAJAAkACQCABKAIgIgINAEEAIQEMAQsgASACQX9qNgIgIAEQ2YKAgAAiA0UNAiADKAIEIQECQAJAIAMoAggiBCADKAIAIgUvAY4CTw0AIAUhAgwBCwNAIAUoAgAiAkUNAyABQQFqIQEgBS8BjAIhBCACIQUgBCACLwGOAk8NAAsLAkACQCABDQAgBEEBaiEBIAIhBgwBCyACIARBAnRqQZQCaiEFA0AgBSgCACIGQZACaiEFIAFBf2oiAQ0AC0EAIQELIAMgATYCCCADQQA2AgQgAyAGNgIAIAIgBEEMbGoiAUGIAWohAiABQQRqIQELIAAgAjYCBCAAIAE2AgAPC0GMu8CAABCmhICAAAALQdjPwIAAEKaEgIAAAAuWAQECfyOAgICAAEEgayIDJICAgIAAIANBFGogAiABa0ECdkEAQQRBDBCWgICAACADKAIYIQQCQCADKAIUQQFHDQAgBCADKAIcEO+DgIAAAAsgA0EANgIQIAMgAygCHDYCDCADIAQ2AgggA0EIaiABIAIQzoCAgAAgACADKAIQNgIIIAAgAykCCDcCACADQSBqJICAgIAAC6ACAQV/AkACQAJAAkAgASgCICICDQBBACEBDAELIAEgAkF/ajYCICABENuCgIAAIgNFDQIgAygCBCEBAkACQCADKAIIIgQgAygCACIFLwEyTw0AIAUhAgwBCwNAIAUoAgAiAkUNAyABQQFqIQEgBS8BMCEEIAIhBSAEIAIvATJPDQALCwJAAkAgAQ0AIARBAWohASACIQYMAQsgAiAEQQJ0akHQAGohBQNAIAUoAgAiBkHMAGohBSABQX9qIgENAAtBACEBCyADIAE2AgggA0EANgIEIAMgBjYCACACIARBAnRqQQRqIQUgAiAEQQF0akE0aiEBCyAAIAU2AgQgACABNgIADwtBjLvAgAAQpoSAgAAAC0HYz8CAABCmhICAAAALDwAgACgCACABEKGEgIAAC5MBAQJ/I4CAgIAAQTBrIgEkgICAgAACQAJAIAAoAgAiAg0AQQAhAEEAIQIMAQsgASACNgIkIAFBADYCICABIAI2AhQgAUEANgIQIAEgACgCBCICNgIoIAEgAjYCGCAAKAIIIQJBASEACyABIAI2AiwgASAANgIcIAEgADYCDCABQQxqEKODgIAAIAFBMGokgICAgAALnwEBAn8jgICAgABBMGsiASSAgICAAAJAAkAgACgCACICDQBBACEAQQAhAgwBCyABIAI2AhggAUEANgIUIAEgAjYCCCABQQA2AgQgASAAKAIEIgI2AhwgASACNgIMIAAoAgghAkEBIQALIAEgAjYCICABIAA2AhAgASAANgIAA0AgAUEkaiABEOGCgIAAIAEoAiQNAAsgAUEwaiSAgICAAAsZACAAKAIAIgAoAgQgACgCCCABEMqEgIAAC+8XAwR/Bn0XfyOAgICAAEHAAGsiAySAgICAACADQTBqIAEQs4KAgABBfyEEIAMtADQhBQJAAkAgAygCMCIGQX9GDQAgACADKAA4NgAMIAAgAygANTYACSAAIAU6AAggACAGNgIEIABBfjYCAAwBCwJAAkAgBUH/AXENAAwBCwJAAkACQAJAAkACQAJAAkAgAkENSw0AIANBMGogARC2goCAACADLwE0IQUCQCADKAIwIgZBf0YNACAFQQh2IQEgAygCOCECIAMvATYhBAwICyADQTBqIAEgBRC4goCAACADKAI8IQIgAygCOCEFIAMoAjQhBgJAIAMoAjBBAUcNACAFQRB2IQQgBUEIdiEBDAgLIAMgAjYCLCADIAU2AiggAyAGNgIkIANBMGogARC1goCAACADKgI0IQcCQAJAIAMoAjAiBkF/Rg0AIAe8IgVBEHYhBCAFQQh2IQEgAygCOCECDAEL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C4kBAQN/I4CAgIAAQRBrIgMkgICAgAAgA0EEaiACQQBBAUEBEJaAgIAAIAMoAgghBAJAIAMoAgRBAUYNACADKAIMIQUCQCACRQ0AIAJFDQAgBSABIAL8CgAACyAAIAI2AgggACAFNgIEIAAgBDYCACADQRBqJICAgIAADwsgBCADKAIMEO+DgIAAAAu8EAMIfwR9BX8jgICAgABBwAFrIgIkgICAgAAgAkGAAWogARC3goCAACACKAKEASEDAkACQCACKAKAASIEQX9GDQAgACACKAKIATYCDCAAIAM2AgggACAENgIEIABBfzYCAAwBCyACQYABaiABELeCgIAAIAIoAoQBIQQCQCACKAKAASIFQX9GDQAgACACKAKIATYCDCAAIAQ2AgggACAFNgIEIABBfzYCAAwBCyACQYABaiABELOCgIAAIAItAIQBIQUCQCACKAKAASIGQX9GDQAgACACKACIATYADCAAIAIoAIUBNgAJIAAgBToACCAAIAY2AgQgAEF/NgIADAELIAJBgAFqIAEQs4KAgAAgAi0AhAEhBgJAIAIoAoABIgdBf0YNACAAIAIoAIgBNgAMIAAgAigAhQE2AAkgACAGOgAIIAAgBzYCBCAAQX82AgAMAQsgAkGAAWogARCzgoCAACACLQCEASEHAkAgAigCgAEiCEF/Rg0AIAAgAigAiAE2AAwgACACKACFATYACSAAIAc6AAggACAINgIEIABBfzYCAAwBCyACQYABaiABELaCgIAAIAIvAYQBIQgCQCACKAKAASIJQX9GDQAgACACLwGKATsBDiAAIAIoAYYBNgEKIAAgCDsBCCAAIAk2AgQgAEF/NgIADAELIAJBgAFqIAEQtYKAgAAgAioChAEhCgJAIAIoAoABIglBf0YNACAAIAIoAogBNgIMIAAgCjgCCCAAIAk2AgQgAEF/NgIADAELIAJBgAFqIAEQtYKAgAAgAioChAEhCwJAIAIoAoABIglBf0YNACAAIAIoAogBNgIMIAAgCzgCCCAAIAk2AgQgAEF/NgIADAELIAJBgAFqIAEQtYKAgAAgAioChAEhDAJAIAIoAoABIglBf0YNACAAIAIoAogBNgIMIAAgDDgCCCAAIAk2AgQgAEF/NgIADAELIAJBgAFqIAEQtYKAgAAgAioChAEhDQJAIAIoAoABIglBf0YNACAAIAIoAogBNgIMIAAgDTgCCCAAIAk2AgQgAEF/NgIADAELIAJBgAFqIAEQuoKAgAAgAiACKQKEATcDcCACIAIoAowBNgJ4AkAgAigCgAFBAUcNACAAIAIoAng2AgwgACACKQNwNwIEIABBfzYCAAwBCyACIAIoAng2AhAgAiACKQNwNwMIIAJBgAFqIAEQuoKAgAAgAiACKQKEATcDcCACIAIoAowBNgJ4AkACQCACKAKAAUEBRw0AIAAgAigCeDYCDCAAIAIpA3A3AgQgAEF/NgIADAELIAIgAigCeDYCICACIAIpA3A3AxggAkGAAWogARC6goCAACACIAIpAoQBNwNwIAIgAigCjAE2AngCQAJAIAIoAoABQQFHDQAgACACKAJ4NgIMIAAgAikDcDcCBCAAQX82AgAMAQsgAiACKAJ4NgIwIAIgAikDcDcDKCACQYABaiABELqCgIAAIAIgAikChAE3A3AgAiACKAKMATYCeAJAAkAgAigCgAFBAUcNACAAIAIoAng2AgwgACACKQNwNwIEIABBfzYCAAwBCyACIAIoAng2AkAgAiACKQNwNwM4IAJBgAFqIAEQt4KAgAAgAigChAEhDgJAAkAgAigCgAEiCUF/Rg0AIAAgAigCiAE2AgwgACAONgIIIAAgCTYCBCAAQX82AgAMAQsgAkHEAGogDhCTgoCAAAJAIA5FDQAgAkGMAWohDyACQfQAaiEJA0AgAkHwAGogARC6goCAACACIAkpAgA3A1AgAiAJKAIINgJYAkACQAJAIAIoAnBFDQAgACACKAJYNgIMIAAgAikDUDcCBCAAQX82AgAMAQsgAkHwAGogARC6goCAACACIAkpAgA3A2AgAiAJKAIINgJoAkAgAigCcEEBRw0AIAAgAigCaDYCDCAAIAIpA2A3AgQgAEF/NgIAIAJB0ABqQQFBARCJgICAAAwBCyACQfAAaiABELOCgIAAIAItAHQhECACKAJwIhFBf0YNASAAIAIoAHg2AAwgACACKAB1NgAJIAAgEDoACCAAIBE2AgQgAEF/NgIAIAJB4ABqQQFBARCJgICAACACQdAAakEBQQEQiYCAgAALIAJBxABqEPaAgIAADAMLIA8gAikDYDcCACAPIAIoAmg2AgggAiACKQNQNwOAASACIAIoAlg2AogBIBBB/wFxQQBHIRICQCACKAJM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CCEDDAELIAJFDQELIAJFDQAgACgCBCADaiABIAL8CgAACyAAIAMgAmo2AghBAAs3AQF/AkAgACgCCCIBRQ0AIAAoAgQhAANAIABBAUEBEImAgIAAIABBHGohACABQX9qIgENAAsLCwgAQaDFwYAACxQAIABBlOrAgAAgASACEIuEgIAAC1oBAX8jgICAgABBEGsiASSAgICAACABQQRqIABBAEEBQQEQloCAgAACQCABKAIEQQFHDQAgASgCCCABKAIMEO+DgIAAAAsgASgCDCEAIAFBEGokgICAgAAgAAtwAQF/I4CAgIAAQYADayICJICAgIAAIAJBCGogACABEIaCgIAAAkACQCACKAIIQQJGDQAgAkEIahDygoCAACEBIAJBCGoQh4GAgAAMAQsgAkEMakEBQQEQiYCAgABBACEBCyACQYADaiSAgICAACABC1EBAX8jgICAgABBEGsiAiSAgICAAAJAIABFDQAgAUUNACACQQA2AgwgAiAANgIIIAIgATYCBCACQQRqQQFBARCJgICAAAsgAkEQaiSAgICAAAsbAAJAIABFDQAgAUUNACAAIAFBARC0g4CAAAsLyhoDAX8BfgZ/I4CAgIAAQcAHayICJICAgIAAIAJBEGogACABEIaCgIAAAkACQAJAIAIoAhBBAkcNACACIAIoAhw2AsgGIAIgAikCFDcDwAYgAkGBgICAADYClAYgAiACQcAGajYCkAYgAkGIA2pB24bAgAAgAkGQBmoQ94OAgAAgAikDiAMhAyACKAKQAyEBIAJBwAZqQQFBARCJgICAAAwBCyACQYgDaiACQRBqQfgC/AoAACACQcAGaiACQYgDahCKgoCAAAJAIAIoAoAHQQJHDQAgAiACKALIBjYCuAcgAiACKQPABjcDsAcgAkGBgICAADYCpAcgAiACQbAHajYCoAcgAkGQBmpBuYbAgAAgAkGgB2oQ94OAgAAgAikDkAYhAyACIAIoApgGIgE2ApgGIAIgAzcDkAYgAkEIaiACQZAGahCNgoCAAEEAIAE2ArjFwYAAIAIoAgghASACQbAHakEBQQEQiYCAgAAgAkGIA2oQh4GAgAAMAgsgAiACKAL4BjYCiAYgAiACKQPwBjcDgAYgAigC/AYhASACQZAGaiACQcAGakEw/AoAACACIAE2AowGIAIgAigCzAU2ApwHIAIg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oAdqNgL4BiACQbAHakGJtMCAACACQcAGahD3g4CAACACKAK0ByEJAkACQAJAIAIoArgHIgEgAigCiAcgBmtNDQAgAkGIB2ogBiABQQFBARCSgICAACACKAKQByEGDAELIAFFDQELIAFFDQAgAigCjAcgBmogCSAB/AoAAAsgAiAGIAFqIgY2ApAHIAJBsAdqQQFBARCJgICAACAEIABB4ABqIgBHDQALCwJAAkAgAigCiAYiAQ0AIAIoApAHIQYMAQsgAUEsbCEHIAIoAoQGQRBqIQEgAigCkAchBkEAIQkDQCACIAk2ApQHIAIgASgCADYCoAcgAkGHgICAADYCzAYgAkGHgICAADYCxAYgAiACQaAHajYCyAYgAiACQZQHajYCwAYgAkGwB2pB5LPAgAAgAkHABmoQ94OAgAAgAigCtAchCAJAAkACQCACKAK4ByIAIAIoAogHIgQgBmtNDQAgAkGIB2ogBiAAQQFBARCSgICAACACKAKIByEEIAIoApAHIQYMAQsgAEUNAQsgAEUNACACKAKMByAGaiAIIAD8CgAACyACIAYgAGoiBjYCkAcgAkGwB2pBAUEBEImAgIAAIAJBoB82ArgHIAIgAUF8aigCACIANgKwByACIAAgASgCAGo2ArQHIAJBADYCyAYgAkKAgICAEDcCwAYgAkHABmogAkGwB2oQ7IGAgAAgAiACKALIBiIANgKoByACIAIpAsAGNwOgByACKAKkByEIAkACQAJAIAAgBCAGa00NACACQYgHaiAGIABBAUEBEJKAgIAAIAIoAogHIQQgAigCkAchBgwBCyAARQ0BCyAARQ0AIAIoAowHIAZqIAggAPwKAAALIAIgBiAAaiIANgKQBwJAIAQgAEcNACACQYgHaiAEQQFBAUEBEJKAgIAAIAIoApAHIQALIAIoAowHIABqQQo6AAAgAiAAQQFqIgY2ApAHIAJBoAdqQQFBARCJgICAACAJQQFqIQkgAUEsaiEBIAdBVGoiBw0ACwsgAkHABmpBqOPAgAAQj4CAgAACQCACKAKIByIJIAZrQRJLDQAgAkGIB2ogBkETQQFBARCSgICAACACKAKIByEJIAIoApAHIQYLIAIoAowHIgQgBmoiAUEAKQC86sCAADcAACABQQApAMTqwIAANwAIIAFBACgAy+rAgAA2AA8gAiAGQRNqIgA2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ADYCqMfBgABBAEGUx8GAADYCnMfBgABBAEGkx8GAADYCsMfBgABBAEGcx8GAADYCpMfBgABBAEGsx8GAADYCuMfBgABBAEGkx8GAADYCrMfBgABBAEG0x8GAADYCwMfBgABBAEGsx8GAADYCtMfBgABBAEG8x8GAADYCyMfBgABBAEG0x8GAADYCvMfBgABBAEHEx8GAADYC0MfBgABBAEG8x8GAADYCxMfBgABBAEHEx8GAADYCzMfBgABBAEHMx8GAADYC2MfBgABBAEHMx8GAADYC1MfBgABBAEHUx8GAADYC4MfBgABBAEHUx8GAADYC3MfBgABBAEHcx8GAADYC6MfBgABBAEHcx8GAADYC5MfBgABBAEHkx8GAADYC8MfBgABBAEHkx8GAADYC7MfBgABBAEHsx8GAADYC+MfBgABBAEHsx8GAADYC9MfBgABBAEH0x8GAADYCgMjBgABBAEH0x8GAADYC/MfBgABBAEH8x8GAADYCiMjBgABBAEH8x8GAADYChMjBgABBAEGEyMGAADYCkMjBgABBAEGMyMGAADYCmMjBgABBAEGEyMGAADYCjMjBgABBAEGUyMGAADYCoMjBgABBAEGMyMGAADYClMjBgABBAEGcyMGAADYCqMjBgABBAEGUyMGAADYCnMjBgABBAEGkyMGAADYCsMjBgABBAEGcyMGAADYCpMjBgABBAEGsyMGAADYCuMjBgABBAEGkyMGAADYCrMjBgABBAEG0yMGAADYCwMjBgABBAEGsyMGAADYCtMjBgABBAEG8yMGAADYCyMjBgABBAEG0yMGAADYCvMjBgABBAEHEyMGAADYC0MjBgABBAEG8yMGAADYCxMjBgABBAEHMyMGAADYC2MjBgABBAEHEyMGAADYCzMjBgABBAEHUyMGAADYC4MjBgABBAEHMyMGAADYC1MjBgABBAEHcyMGAADYC6MjBgABBAEHUyMGAADYC3MjBgABBAEHkyMGAADYC8MjBgABBAEHcyMGAADYC5MjBgABBAEHsyMGAADYC+MjBgABBAEHkyMGAADYC7MjBgABBAEH0yMGAADYCgMnBgABBAEHsyMGAADYC9MjBgABBAEH8yMGAADYCiMnBgABBAEH0yMGAADYC/MjBgABBACAGQQ9qQXhxIgBBeGoiAjYCoMnBgABBAEH8yMGAADYChMnB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QQRqEL+DgIAAAAtNAAJAAkAgAUEJSQ0AIAEgABDGg4CAACEBDAELIAAQx4OAgAAhAQsCQCABRQ0AIAFBfGotAABBA3FFDQAgAEUNACABQQAgAPwLAAsgAQsNACABIAAQ0YOAgAAACy8BAX8jgICAgABBEGsiAiSAgICAACACIAE2AgwgAiAANgIIIAJBCGoQvYOAgAAAC84CAQR/QQAhAgJAIAFBCHYiA0UNAEEfIQIgAUGAgIAITw0AIAFBJiADZyICa3ZBAXEgAkEBdHJBPnMhAgsgAEIANwIQIAAgAjYCHCACQQJ0QfTFwYAAaiEDAkBBACgCkMnBgABBASACdCIEcQ0AIAMgADYCACAAIAM2AhggACAANgIMIAAgADYCCEEAQQAoApDJwYAAIARyNgKQycGAAA8LAkACQAJAIAMoAgAiBCgCBEF4cSABRw0AIAQhAgwBCyABQQBBGSACQQF2ayACQR9GG3QhAwNAIAQgA0EddkEEcWoiBSgCECICRQ0CIANBAXQhAyACIQQgAigCBEF4cSABRw0ACwsgAigCCCIDIAA2AgwgAiAANgIIIABBADYCGCAAIAI2AgwgACADNgIIDwsgBUEQaiAANgIAIAAgBDYCGCAAIAA2AgwgACAANgIIC14BAn9BACEBQQBBACgC8MXBgAAiAkEBajYC8MXBgAACQCACQQBIDQBBASEBQQAtAMTFwYAADQBBACAAOgDExcGAAEEAQQAoAsDFwYAAQQFqNgLAxcGAAEECIQELIAELPAEBfyOAgICAAEEQayIBJICAgIAAIAFBqICAgACtQiCGIAFBD2qthDcDAEHlhsCAACABIAAQiISAgAAAC0QBAX8jgICAgABBEGsiAiSAgICAACACQQhqIAFBzO3AgABBCxCZhICAACACQQhqEJOEgIAAIQEgAkEQaiSAgICAACABC2gBAn8jgICAgABBEGsiASSAgICAACABQQA6AA8Qt4OAgAACQEEBQQEQs4OAgAAiAg0AQQFBARD0g4CAAAALIAAgAUEPaq03AwAgACACrTcDCCACQQFBARC0g4CAACABQRBqJICAgIAACx4AIABBACkCiOzAgAA3AgggAEEAKQKA7MCAADcCAAseACAAQQApAvjrwIAANwIIIABBACkC8OvAgAA3AgALRAACQCAAKAIAQX9GDQAgASAAKAIE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C5kGAgh/AX5BK0F/IAAoAggiBkGAgIABcSIHGyEIIAdBFXZBASABGyAFaiEJAkACQCAGQYCAgARxDQBBACECDAELAkACQCADQRBJDQAgAiADEJuEgIAAIQcMAQsCQCADDQBBACEHDAELIANBA3EhCkEAIQtBACEHAkAgA0EESQ0AIANBDHEhDEEAIQtBACEHA0AgByACIAtqIg0sAABBv39KaiANQQFqLAAAQb9/SmogDUECaiwAAEG/f0pqIA1BA2osAABBv39KaiEHIAwgC0EEaiILRw0ACyAKRQ0BCyACIAtqIQ0DQCAHIA0sAABBv39KaiEHIA1BAWohDSAKQX9qIgoNAAsLIAcgCWohCQsgCEEtIAEbIQwCQAJAIAkgAC8BDCIBTw0AAkACQAJAIAZBgICACHENACABIAlrIQhBACEHQQAhAQJAAkACQCAGQR12QQNxDgQCAAEAAgsgCCEBDAELIAhB/v8DcUEBdiEBCyAGQf///wBxIQkgACgCBCELIAAoAgAhCgNAIAdB//8DcSABQf//A3FPDQJBASENIAdBAWohByAKIAkgCygCEBGEgICAAICAgIAARQ0ADAULCyAAIAApAggiDqdBgICA/3lxQbCAgIACcjYCCEEBIQ0gACgCACIKIAAoAgQiCyAMIAIgAxCchICAAA0DQQAhByABIAlrQf//A3EhAgNAIAdB//8DcSACTw0CQQEhDSAHQQFqIQcgCkEwIAsoAhARhICAgACAgICAAEUNAAwECwtBASENIAogCyAMIAIgAxCchICAAA0CIAogBCAFIAsoAgwRg4CAgACAgICAAA0CQQAhByAIIAFrQf//A3EhAANAIAdB//8DcSICIABJIQ0gAiAATw0DIAdBAWohByAKIAkgCygCEBGEgICAAICAgIAARQ0ADAMLC0EBIQ0gCiAEIAUgCygCDBGDgICAAICAgIAADQEgACAONwIIQQAPC0EBIQ0gACgCACIHIAAoAgQiCiAMIAIgAxCchICAAA0AIAcgBCAFIAooAgwRg4CAgACAgICAACENCyANC+sGAQh/AkACQCABIABBA2pBfHEiAiAAayIDSQ0AIAEgA2siBEECdiIFRQ0AIARBA3EhBkEAIQdBACEBAkAgAiAARg0AQQAhCEEAIQECQCAAIAJrIglBfEsNAEEAIQhBACEBA0AgASAA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OgAACyABQQFBAUEAIAJBC2ogA2pBBSADaxCahICAACEAIAJBEGokgICAgAAgAAuEAQECfyOAgICAAEEQayICJICAgIAAIAAtAAAhA0EAIQADQCACQQ5qIABqQQFqIANBD3FBmILBgABqLQAAOgAAIABBf2ohACADQQR2QQ9xIgMNAAsgAUEBQdbBwYAAQQIgAkEOaiAAakECakEAIABrEJqEgIAAIQAgAkEQaiSAgICAACAAC34BAn8jgICAgABBEGsiAiSAgICAACAAKAIAIQNBACEAA0AgAkEIaiAAakEHaiADQQ9xLQDYwcGAADoAACAAQX9qIQAgA0EEdiIDDQALIAFBAUHWwcGAAEECIAJBCGogAGpBCGpBACAAaxCahICAACEAIAJBEGokgICAgAAgAAu0AQEBfyOAgICAAEEgayICJICAgIAAAkACQCAALQAEQQFHDQAgAiAALQAFOgAPIAJBh4CAgACtQiCGIACthDcDGCACQYaAgIAArUIghiACQQ9qrYQ3AxAgASgCACABKAIEQYOBwIAAIAJBEGoQi4SAgAAhAAwBCyACQYeAgIAArUIghiAArYQ3AxAgASgCACABKAIEQbSBwIAAIAJBEGoQi4SAgAAhAAsgAkEgaiSAgICAACAACy0AAkAgAC0AAA0AIAFB6MHBgABBBRCehICAAA8LIAFB7cHBgABBBBCehICAAAsOACACIAAgARCehICAAAsUACAAQdiEwYAAIAEgAhCLhICAAAtKAQN/QQAhAwJAIAJFDQACQANAIAAtAAAiBCABLQAAIgVHDQEgAEEBaiEAIAFBAWohASACQX9qIgJFDQIMAAsLIAQgBWshAwsgAwupHwgHfwF8CH8BfAV/AXwFfwF8I4CAgIAAQbAEayIGJICAgIAAIAZCADcDmAEgBkIANwOQASAGQgA3A4gBIAZCADcDgAEgBkIANwN4IAZCADcDcCAGQgA3A2ggBkIANwNgIAZCADcDWCAGQgA3A1AgBkIANwNIIAZCADcDQCAGQgA3AzggBkIANwMwIAZCADcDKCAGQgA3AyAgBkIANwMYIAZCADcDECAGQgA3AwggBkIANwMAIAZCADcDuAIgBkIANwOwAiAGQgA3A6gCIAZCADcDoAIgBkIANwOYAiAGQgA3A5ACIAZCADcDiAIgBkIANwOAAiAGQgA3A/gB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Y3J5cHRpb24gY29uZmlnIHZlcnNpb24gwAARc3RhcnQgYnl0ZSBpbmRleCDAJyBpcyBvdXQgb2YgYm91bmRzIGZvciBzdHJpbmcgb2YgbGVuZ3RoIMAAD2VuZCBieXRlIGluZGV4IMAnIGlzIG91dCBvZiBib3VuZHMgZm9yIHN0cmluZyBvZiBsZW5ndGggwAAScmFuZ2Ugc3RhcnQgaW5kZXggwCIgb3V0IG9mIHJhbmdlIGZvciBzbGljZSBvZiBsZW5ndGggwAAQcmFuZ2UgZW5kIGluZGV4IMAiIG91dCBvZiByYW5nZSBmb3Igc2xpY2Ugb2YgbGVuZ3RoIMAAFnNuYXBzaG90IHRydW5jYXRlZCBhdCDABiBuZWVkIMAGIGhhdmUgwAAbdW5zdXBwb3J0ZWQgd2F0ZXJtYXJrIGtpbmQgwAAFIC9UVSDAABBhc3NlcnRpb24gYGxlZnQgwBcgcmlnaHRgIGZhaWxlZAogIGxlZnQ6IMAJCiByaWdodDogwAAQYXNzZXJ0aW9uIGBsZWZ0IMAQIHJpZ2h0YCBmYWlsZWQ6IMAJCiAgbGVmdDogwAkKIHJpZ2h0OiDAABBwYWdpbmF0ZSBlcnJvcjogwAAMdXRmOCBlcnJvcjogwAAHZXJyb3I6IMAASGNhbm5vdCBhY2Nlc3MgYSBUaHJlYWQgTG9jYWwgU3RvcmFnZSB2YWx1ZSBkdXJpbmcgb3IgYWZ0ZXIgZGVzdHJ1Y3Rpb246IMAAC2JhZCBtYWdpYzogwADAAjogwAAKIC9MZW5ndGgxIMAAAiAvwAEgwABDOlxVc2Vyc1xtcnpcLnJ1c3R1cFx0b29sY2hhaW5zXHN0YWJsZS14ODZfNjQtcGMtd2luZG93cy1tc3ZjXGxpYi9ydXN0bGliL3NyYy9ydXN0XGxpYnJhcnkvYWxsb2Mvc3JjL2NvbGxlY3Rpb25zL2J0cmVlL21hcC9lbnRyeS5ycwAvcnVzdC9kZXBzL2hhc2hicm93bi0wLjE3LjEvc3JjL3Jhdy5ycwAvcnVzdGMvOGJhYjI2ZjRmNjhlMGUyNmYwYmI3OTYwYmUzMzRkNWI1MjBlYTQ1Mi9saWJyYXJ5L2NvcmUvc3JjL251bS9pbXAvZmx0MmRlYy9zdHJhdGVneS9ncmlzdS5ycwAvcnVzdGMvOGJhYjI2ZjRmNjhlMGUyNmYwYmI3OTYwYmUzMzRkNWI1MjBlYTQ1Mi9saWJyYXJ5L2NvcmUvc3JjL3NsaWNlL3NvcnQvc2hhcmVkL3NtYWxsc29ydC5ycwBDOlxVc2Vyc1xtcnpcLnJ1c3R1cFx0b29sY2hhaW5zXHN0YWJsZS14ODZfNjQtcGMtd2luZG93cy1tc3ZjXGxpYi9ydXN0bGliL3NyYy9ydXN0XGxpYnJhcnkvY29yZS9zcmMvc2xpY2Uvc29ydC91bnN0YWJsZS9xdWlja3NvcnQucnMAQzpcVXNlcnNcbXJ6XC5ydXN0dXBcdG9vbGNoYWluc1xzdGFibGUteDg2XzY0LXBjLXdpbmRvd3MtbXN2Y1xsaWIvcnVzdGxpYi9zcmMvcnVzdFxsaWJyYXJ5L2NvcmUvc3JjL3NsaWNlL3NvcnQvc3RhYmxlL3F1aWNrc29ydC5ycwBzcmNcZW5jcnlwdC5ycwBzcmNcc25hcHNob3QucnMAc3JjXGZvbnQucnMAL3J1c3RjLzhiYWIyNmY0ZjY4ZTBlMjZmMGJiNzk2MGJlMzM0ZDViNTIwZWE0NTIvbGlicmFyeS9hbGxvYy9zcmMvZm10LnJzAC9ydXN0Yy84YmFiMjZmNGY2OGUwZTI2ZjBiYjc5NjBiZTMzNGQ1YjUyMGVhNDUyL2xpYnJhcnkvY29yZS9zcmMvbnVtL2ltcC9kaXlfZmxvYXQucnMAQzpcVXNlcnNcbXJ6XC5ydXN0dXBcdG9vbGNoYWluc1xzdGFibGUteDg2XzY0LXBjLXdpbmRvd3MtbXN2Y1xsaWIvcnVzdGxpYi9zcmMvcnVzdFxsaWJyYXJ5L3N0ZC9zcmMvc3lzL3RocmVhZF9sb2NhbC9ub190aHJlYWRzLnJzAC9ydXN0Yy84YmFiMjZmNGY2OGUwZTI2ZjBiYjc5NjBiZTMzNGQ1YjUyMGVhNDUyL2xpYnJhcnkvc3RkL3NyYy9zeXMvc3luYy9yd2xvY2svbm9fdGhyZWFkcy5ycwBDOlxVc2Vyc1xtcnpcLnJ1c3R1cFx0b29sY2hhaW5zXHN0YWJsZS14ODZfNjQtcGMtd2luZG93cy1tc3ZjXGxpYi9ydXN0bGliL3NyYy9ydXN0XGxpYnJhcnkvYWxsb2Mvc3JjL3N0ci5ycwAvcnVzdGMvOGJhYjI2ZjRmNjhlMGUyNmYwYmI3OTYwYmUzMzRkNWI1MjBlYTQ1Mi9saWJyYXJ5L2FsbG9jL3NyYy9zdHIucnMAQzpcVXNlcnNcbXJ6XC5ydXN0dXBcdG9vbGNoYWluc1xzdGFibGUteDg2XzY0LXBjLXdpbmRvd3MtbXN2Y1xsaWIvcnVzdGxpYi9zcmMvcnVzdFxsaWJyYXJ5L2NvcmUvc3JjL3N0ci9wYXR0ZXJuLnJzAC9ydXN0Yy84YmFiMjZmNGY2OGUwZTI2ZjBiYjc5NjBiZTMzNGQ1YjUyMGVhNDUyL2xpYnJhcnkvY29yZS9zcmMvc3RyL3BhdHRlcm4ucnMAL3J1c3RjLzhiYWIyNmY0ZjY4ZTBlMjZmMGJiNzk2MGJlMzM0ZDViNTIwZWE0NTIvbGlicmFyeS9jb3JlL3NyYy9udW0vaW1wL2ZsdDJkZWMvc3RyYXRlZ3kvZHJhZ29uLnJzAC9ydXN0Yy84YmFiMjZmNGY2OGUwZTI2ZjBiYjc5NjBiZTMzNGQ1YjUyMGVhNDUyL2xpYnJhcnkvY29yZS9zcmMvbnVtL2ltcC9iaWdudW0ucnMAQzpcVXNlcnNcbXJ6XC5ydXN0dXBcdG9vbGNoYWluc1xzdGFibGUteDg2XzY0LXBjLXdpbmRvd3MtbXN2Y1xsaWIvcnVzdGxpYi9zcmMvcnVzdFxsaWJyYXJ5L3N0ZC9zcmMvdGhyZWFkL2xvY2FsLnJzAHNyY1x0dGYucnMAc3JjXHBkZi5ycwBzcmNccGFnaW5hdGUucnMAc3JjXGRlZmxhdGUucnMAQzpcVXNlcnNcbXJ6XC5ydXN0dXBcdG9vbGNoYWluc1xzdGFibGUteDg2XzY0LXBjLXdpbmRvd3MtbXN2Y1xsaWIvcnVzdGxpYi9zcmMvcnVzdFxsaWJyYXJ5L2FsbG9jL3NyYy9jb2xsZWN0aW9ucy9idHJlZS9uYXZpZ2F0ZS5ycwAvcnVzdGMvOGJhYjI2ZjRmNjhlMGUyNmYwYmI3OTYwYmUzMzRkNWI1MjBlYTQ1Mi9saWJyYXJ5L2NvcmUvc3JjL3VuaWNvZGUvcHJpbnRhYmxlLnJzAEM6XFVzZXJzXG1yelwucnVzdHVwXHRvb2xjaGFpbnNcc3RhYmxlLXg4Nl82NC1wYy13aW5kb3dzLW1zdmNcbGliL3J1c3RsaWIvc3JjL3J1c3RcbGlicmFyeS9hbGxvYy9zcmMvY29sbGVjdGlvbnMvYnRyZWUvbm9kZS5ycwAvcnVzdGMvOGJhYjI2ZjRmNjhlMGUyNmYwYmI3OTYwYmUzMzRkNWI1MjBlYTQ1Mi9saWJyYXJ5L2FsbG9jL3NyYy9yYXdfdmVjL21vZC5ycwAvcnVzdGMvOGJhYjI2ZjRmNjhlMGUyNmYwYmI3OTYwYmUzMzRkNWI1MjBlYTQ1Mi9saWJyYXJ5L2NvcmUvc3JjL251bS9pbXAvZmx0MmRlYy9tb2QucnMAL3J1c3QvZGVwcy9kbG1hbGxvYy0wLjIuMTMvc3JjL2RsbWFsbG9jLnJzAHNyY1xsaWIucnMAL3J1c3RjLzhiYWIyNmY0ZjY4ZTBlMjZmMGJiNzk2MGJlMzM0ZDViNTIwZWE0NTIvbGlicmFyeS9jb3JlL3NyYy91bmljb2RlL3VuaWNvZGVfZGF0YS5ycwDAFSAvRmlsdGVyIC9GbGF0ZURlY29kZQAnIC9UeXBlIC9YT2JqZWN0IC9TdWJ0eXBlIC9JbWFnZSAvV2lkdGggwAkgL0hlaWdodCDAPiAvQ29sb3JTcGFjZSAvRGV2aWNlUkdCIC9CaXRzUGVyQ29tcG9uZW50IDggL0ZpbHRlciAvRENURGVjb2RlAAkvQW5ub3RzIFvAAV0AASDAAiBbwAFdAAFbwAFdAAkvQW5ub3RzIFvAASDAAV0AAVvAASDAAV0AKiAvVHlwZSAvWE9iamVjdCAvU3VidHlwZSAvRm9ybSAvQkJveCBbMCAwIMABIMABXQALIC9BY3JvRm9ybSDABCAwIFIAJyAvVHlwZSAvWE9iamVjdCAvU3VidHlwZSAvSW1hZ2UgL1dpZHRoIMAJIC9IZWlnaHQgwDMgL0NvbG9yU3BhY2UgL0RldmljZVJHQiAvQml0c1BlckNvbXBvbmVudCA4IC9TTWFzayDABCAwIFIADS9Gb250IDw8IC9GMSDACiAwIFIgL0YxQiDACiAwIFIgL0YxSSDACyAwIFIgL0YxQkkgwAQgMCBSAAMgL0bAASDABCAwIFIAKjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMCAvQmFzZUZvbnQgL8AqIC9FbmNvZGluZyAvSWRlbnRpdHktSCAvRGVzY2VuZGFudEZvbnRzIFsgwBIgMCBSIF0gL1RvVW5p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AAAvAAAA9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfoATQGYAfQB9AFBAwoDtABNAU0B9AE0AvoATQH6ABYB9AH0AfQB9AH0AfQB9AH0AfQB9AEWARYBNAI0AjQCvAGZA5sCmwKbAtICmwJjAgoD0gIWAfQBmwIsAkED0gIKA5sCCgPSApsCYwLSApsCsAObApsCYwIWARYBFgHVAU0BTQEsAiwC9AEsAiwCFgEsAiwC3gDeAPQB3gBBAywCLAIsAiwCTQH0ARYBLAL0AdIC9AH0AfQBTgEEAU4BSAL0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AH0AfQB9AEICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHCAgICAgICAhxClcgbgpRCltdIDAgZAoAsQoQAA8AAAB0AwAAGgAAALEKEAAPAAAAkAMAACcAAACxChAADwAAAJEJAAALAAAACi0tLSBERUJVRyBMT0cgRU5EIC0tLQoAAAAAPkw3CT4AAIA+hxbZPQAAwD4K16M9AAAAP/ypcT0AACA/MQgsPQAAQD9CYOU8AABgP5ZDizwAAIA/WDk0PAAAkD+mm8Q7AACgP6abRDsAALA/pptEOwAAwD+mm8Q6bWlkID4gbGVuAAAAAAAAAAAAAAABAAAAIQAAAGNhbGxlZCBgUmVzdWx0Ojp1bndyYXAoKWAgb24gYW4gYEVycmAgdmFsdWUKZW5kc3RyZWFtMDAwMDAwMDAwMCA2NTUzNSBmIAp0cmFpbGVyCjw8IMMgAABpCgAKIDAwMDAwIG4gCgAlUERGLTEuNAol4uPP0woKZW5kb2JqCgoApgoQAAoAAABDAAAAFQAAAHNmbnQgdmVyc2lvbpsKEAAKAAAAyQEAAAwAAACbChAACgAAAMkBAAATAAAAbnVtVGFibGVzc2VhcmNoUmFuZ2VlbnRyeVNlbGVjdG9ycmFuZ2VTaGlmdG5vIGhlYWQgcmVjb3JkY2xlYXIgY2hlY2tzdW1BZGp1c3RtZW50Y2hlY2tzdW1BZGp1c3RtZW50AJsKEAAKAAAA2gEAABAAAACbChAACgAAANoBAAAsAAAAmwoQAAoAAADRAQAAEAAAAJsKEAAKAAAA0QEAACcAAAB0YWJsZSBjaGVja3N1bXRhYmxlIG9mZnNldHRhYmxlIGxlbmd0aHBvc3QAAJsKEAAKAAAAyQAAACUAAABnbHlmbm8gZ2x5ZmdseWYgc2xpY2UgT09CZ2x5cGggaWQgT09CbG9jYW5vIGxvY2Fsb2NhIHNob3J0bG9jYSB0cnVuY2F0ZWRsb2NhIGxvbmdtYXhwbm8gbWF4cGhoZWFubyBoaGVhbm8gaGVhZGNtYXBobXR4aGVhZCB0cnVuY2F0ZWRoaGVhIHRydW5jYXRlZG1heHAgdHJ1bmNhdGVkAABjb21wb3NpdGUgZmxhZ3Njb21wb25lbnQgZ2lkbWlzc2luZyByZW1hcHBlZCBjb21wb25lbnQgZ2lkaW5zdHJ1Y3Rpb24gbGVuY29tcG9zaXRlIGluc3RydWN0aW9ucyB0cnVuY2F0ZWRjb21wb3NpdGUgaW5zdHJ1Y3Rpb25zIGxlbmNvbXBvc2l0ZSBnbHlwaCB0cnVuY2F0ZWRsb2NmbXRudW1HbHlwaHNudW1IbWV0cmljc5sKEAAKAAAApwAAACIAAACbChAACgAAAKoAAAAnAAAAmwoQAAoAAACjAAAAIgAAAJsKEAAKAAAApAAAACcAAABubyBjbWFwAJsKEAAKAAAAewAAABgAAACbChAACgAAAHsAAAAlAAAAmwoQAAoAAAB7AAAANgAAAJsKEAAKAAAAewAAAEcAAABvZmZzZXRsZW5ndGh0dGYgZGlyZWN0b3J5IHRydW5jYXRlZHR0ZiB0b28gc21hbGxuBhAACwAAAFEBAAAzAAAAbgYQAAsAAABWAQAAFgAAAG4GEAALAAAAZAEAABsAAABuBhAACwAAAGUBAAAjAAAAbgYQAAsAAAAWAQAAIwAAAG4GEAALAAAAJgEAACoAAABuBhAACwAAAC4BAAAuAAAAbgYQAAsAAAAxAQAAFgAAAG4GEAALAAAA9gAAABwAAABuBhAACwAAAAABAAAXAAAAbgYQAAsAAAD5AAAAHwAAACi/Tl5OdYpBZABOVv/6AQguLgC20Gg+gC8Mqf5kU2l6XgYQAA8AAABnAQAAEQAAAF4GEAAPAAAAggEAAA0AAABeBhAADwAAAIMBAAANAAAAXgYQAA8AAACEAQAADQAAAF4GEAAPAAAAhQEAAA0AAABeBhAADwAAAG0BAAAlAAAAXgYQAA8AAABtAQAAOgAAAF4GEAAPAAAAdAEAAA0AAABeBhAADwAAAHUBAAANAAAAXgYQAA8AAAB2AQAADQAAAF4GEAAPAAAAdwEAAA0AAABeBhAADwAAAIwBAAAbAAAAYXNzZXJ0aW9uIGZhaWxlZDogbGVuID4gMAAAAKkLEAB+AAAAbwEAAAkAAABhc3NlcnRpb24gZmFpbGVkOiBjb3VudCA+IDAAqQsQAH4AAAD5BQAACQAAAGFzc2VydGlvbiBmYWlsZWQ6IG9sZF9yaWdodF9sZW4gKyBjb3VudCA8PSBDQVBBQ0lUWQCpCxAAfgAAAAEGAAANAAAAYXNzZXJ0aW9uIGZhaWxlZDogb2xkX2xlZnRfbGVuID49IGNvdW50AKkLEAB+AAAAAgYAAA0AAABpbnRlcm5hbCBlcnJvcjogZW50ZXJlZCB1bnJlYWNoYWJsZSBjb2RlqQsQAH4AAAAxBgAAFgAAANAKEACCAAAAoQAAACQAAACpCxAAfgAAANAEAAAjAAAAbgYQAAsAAABtAQAADgAAAG4GEAALAAAAdQEAAA4AAADBChAADgAAAN8AAAAgAAAAwQoQAA4AAAD8AAAAJAAAAMEKEAAOAAAA/AAAADsAAADBChAADgAAAAgBAAAcAAAAwQoQAA4AAAD0AAAAJAAAAMEKEAAOAAAAzQAAADEAAADBChAADgAAAM0AAAASAAAAYXNzZXJ0aW9uIGZhaWxlZDogaWR4IDwgQ0FQQUNJVFlhc3NlcnRpb24gZmFpbGVkOiBlZGdlLmhlaWdodCA9PSBzZWxmLmhlaWdodCAtIDGpCxAAfgAAALYCAAAJAAAAqQsQAH4AAAC6AgAACQAAANAKEACCAAAAxgAAACcAAACmChAACgAAANoAAAAoAAAAAAD//2NtYXAgbnVtVGFibGVzbm8gc3VwcG9ydGVkIGNtYXAgZm9ybWF0bm8gdXNhYmxlIGNtYXAgc3VidGFibGVjbWFwIGhlYWRlcpsKEAAKAAAAWAAAAA0AAACbChAACgAAAFgAAAAZAAAAmwoQAAoAAACPAgAAEwAAAGNtYXAgZm10MCBsZW5mbXQ0IHNlZ0NvdW50Zm10NiBmaXJzdGZtdDYgY291bnRjbWFwIGZtdDYgbGVuZm10MTIgZ3JvdXBzY21hcCBmbXQxMiBsZW4AAACbChAACgAAADgAAAAJAAAAmwoQAAoAAAAyAAAACQAAAJsKEAAKAAAAPgAAAAkAAABuBhAACwAAAKkBAAAzAAAAbgYQAAsAAAC5AQAAKwAAAAMABAAFAAYABwAIAAkACgALAA0ADwARABMAFwAbAB8AIwArADMAOwBDAFMAYwBzAIMAowDDAOMAAgEAAAAAAAAAAAEBAQECAgICAwMDAwQEBAQFBQUFAAABAAIAAwAEAAUABwAJAA0AEQAZACEAMQBBAGEAgQDBAAEBgQEBAgEDAQQBBgEIAQwBEAEYASABMAFAAWAAAAAAAQECAgMDBAQFBQYGBwcICAkJCgoLCwwMDQ0AAMEKEAAOAAAAZwEAACQAAADBChAADgAAALQAAAAOAAAAwQoQAA4AAAC1AAAADQAAAMEKEAAOAAAAtgAAAA0AAABPBhAADgAAAHUAAAAVAAAATwYQAA4AAAB3AAAAGQAAAE8GEAAOAAAAKQAAAA0AAABpbnZhbGlkIGVuY3J5cHRpb24gY29uZmlnIGxlbmd0aGVuY3J5cHRpb24gY29uZmlnIHRvbyBzaG9ydABPBhAADgAAAPEAAAAOAAAATwYQAA4AAADyAAAADwAAAE8GEAAOAAAA8wAAABAAAABPBhAADgAAAPQAAAARAAAAeKRq11a3x+jbcCAk7s69wa8PfPUqxodHE0YwqAGVRv3YmIBpr/dEi7Fb//++11yJIhGQa5NxmP2OQ3mmIQi0SWIlHvZAs0DAUVpeJqrHtuldEC/WUxREAoHmodjI+9Pn5s3hIdYHN8OHDdX07RRaRQXp46n4o+/82QJvZ4pMKo1COfr/gfZxhyJhnW0MOOX9ROq+pKnP3ktgS7v2cLy/vsZ+myj6J6HqhTDv1AUdiAQ50NTZ5Znb5vh8oh9lVqzERCIp9Jf/KkOnI5SrOaCT/MNZW2WSzAyPffTv/9FdhIVPfqhv4OYs/hRDAaOhEQhOgn5T9zXyOr270tcqkdOG6wcAAAAMAAAAEQAAABYAAAAHAAAADAAAABEAAAAWAAAABwAAAAwAAAARAAAAFgAAAAcAAAAMAAAAEQAAABYAAAAFAAAACQAAAA4AAAAUAAAABQAAAAkAAAAOAAAAFAAAAAUAAAAJAAAADgAAABQAAAAFAAAACQAAAA4AAAAUAAAABAAAAAsAAAAQAAAAFwAAAAQAAAALAAAAEAAAABcAAAAEAAAACwAAABAAAAAXAAAABAAAAAsAAAAQAAAAFwAAAAYAAAAKAAAADwAAABUAAAAGAAAACgAAAA8AAAAVAAAABgAAAAoAAAAPAAAAFQAAAAYAAAAKAAAADwAAABUAAABPBhAADgAAAIsAAAAmAAAA/v8AALEKEAAPAAAAPgMAACEAAACxChAADwAAAE8DAAArAAAAsQoQAA8AAABbAwAAFwAAAEhlbHZldGljYQAAALEKEAAPAAAAfggAADgAAABFVAoAsQoQAA8AAACYAgAAJQAAALEKEAAPAAAAVwIAABUAAABCVAoAsQoQAA8AAADxCAAASAAAAEZpZWxkAAAAsQoQAA8AAABjCQAAHQAAAC9DSURJbml0IC9Qcm9jU2V0IGZpbmRyZXNvdXJjZSBiZWdpbgoxMiBkaWN0IGJlZ2luCmJlZ2luY21hcAovQ0lEU3lzdGVtSW5mbyA8PCAvUmVnaXN0cnkgKEFkb2JlKSAvT3JkZXJpbmcgKFVDUykgL1N1cHBsZW1lbnQgMCA+PiBkZWYKL0NNYXBOYW1lIC9BZG9iZS1JZGVudGl0eS1VQ1MgZGVmCi9DTWFwVHlwZSAyIGRlZgoxIGJlZ2luY29kZXNwYWNlcmFuZ2UKPDAwMDA+IDxGRkZGPgplbmRjb2Rlc3BhY2VyYW5nZQplbmRjbWFwCkNNYXBOYW1lIGN1cnJlbnRkaWN0IC9DTWFwIGRlZmluZXJlc291cmNlIHBvcAplbmQKZW5kCmVuZGJmY2hhcgoAALEKEAAPAAAAdQkAACQAAAABPMMgAABpBAADPiA8wyAAAGkEAAI+CgABPMMgAABpBAADPiA8wyAAAGkEAMMgAABpBAACPgoAALEKEAAPAAAAeAIAAA8AAABmKgpTCgAAALEKEAAPAAAATwcAABcAAAAwIFRyCjMgVHIKAACxChAADwAAAL8HAABKAAAAsQoQAA8AAACqBwAANwAAAC9GMS9GMUkvRjFCL0YxQknlIAAAcAEAALEKEAAPAAAAcwAAACcAAAAke2N1cnJlbnRQYWdlfSR7dG90YWxQYWdlc30AsQoQAA8AAAD5BgAANwAAALEKEAAPAAAA2QIAACsAAACxChAADwAAAEcCAAAbAAAAsQoQAA8AAABKAgAAEwAAALEKEAAPAAAATwIAAAUAAACxChAADwAAAFACAAAFAAAAsQoQAA8AAABMAgAAFQAAALEKEAAPAAAATQIAABUAAACxChAADwAAAAwBAAAfAAAAMSAxIDEgcmcgMCAwIDAgUkcgMSB3CjAgMCAwIHJnCjEgMSAxIHJnCjAgMCAwIFJHIDEgdwowIDAgMCBSRyAxLjUgdwqxChAADwAAAGQCAAApAAAAsQoQAA8AAABqAgAAJAAAADAxMjM0NTY3ODlBQkNERUYiAAAAPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nID4+PDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgPj48PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EtT2JsaXF1ZSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyA+Pjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYS1Cb2xkT2JsaXF1ZSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyA+PiBUaXRsZUF1dGhvclN1YmplY3RLZXl3b3Jkc0NyZWF0b3JQcm9kdWNlckNyZWF0aW9uRGF0ZU1vZERhdGUvWE9iamVjdCA8PCA+PiAvRXh0R1N0YXRlIDw8IC9Bbm5vdHMgW7EKEAAPAAAAyQsAACUAAAAvT2ZmsQoQAA8AAABeCwAAJAAAALEKEAAPAAAAXAsAABgAAAAvWWVzLTw8IC9UeXBlIC9Bbm5vdCAvU3VidHlwZSAvV2lkZ2V0IC9GVCAvQnRuIC9UIMAIIC9SZWN0IFvAASDAASDAASDAC10gL0YgNCAvRmYgwAQgL1AgwAggMCBSIC9WIMAFIC9BUyDIBwBKIC9NSyA8PCAvQkMgWzAgMCAwXSAvQkcgWzEgMSAxXSA+PiAvQlMgPDwgL1cgMSAvUyAvUyA+PiAvQVAgPDwgL04gPDwgL09mZiDACiAwIFIgL1llcyDADSAwIFIgPj4gPj4gPj4AALEKEAAPAAAA0woAABwAAACxChAADwAAAPIKAAAcAAAAsQoQAA8AAAAqCwAAHAAAACAvVHlwZSAvQ01hcCAvTiAxAAAAsQoQAA8AAABlCgAAKwAAACBdIACxChAADwAAAJ4EAAAbAAAAsQoQAA8AAAClBAAACAAAALEKEAAPAAAApQQAAC0AAACxChAADwAAAMcEAAAXAAAARXJyb3IAAAAjAAAADAAAAAQAAAAkAAAAJQAAACYAAACuCBAAcgAAAGsEAAAkAAAACj09PSBERUJVRyBMT0cgPT09CmJveHRleHRpbWFnZT8DICAjwAEgwAggcGFyZW50PcADIHg9wAMgeT3AAyB3PcADIGg9wAkgZmxhZ3M9MHjDIAAAaQQAAE81EABSNRAAVjUQACkAAAAMAAAABAAAACoAAAArAAAALAAAAAAAAAAIAAAABAAAAC0AAAAuAAAALwAAADAAAAAxAAAAEAAAAAQAAAAyAAAAMwAAADQAAAA1AAAAXPbpX9wC9rnxwXBs8mHBJNoHjEl4ZUzTwn2PTZafJs9hc3NlcnRpb24gZmFpbGVkOiBwc2l6ZSA+PSBzaXplICsgbWluX292ZXJoZWFkAADRDBAAKgAAALEEAAAJAAAAYXNzZXJ0aW9uIGZhaWxlZDogcHNpemUgPD0gc2l6ZSArIG1heF9vdmVyaGVhZAAA0QwQACoAAAC3BAAADQAAAHJ3bG9jayBvdmVyZmxvd2VkIHJlYWQgbG9ja3ObBxAAXQAAABUAAAAsAAAAAAAAAAgAAAAEAAAANgAAAEFjY2Vzc0Vycm9yACkAAAAMAAAABAAAADcAAAByd2xvY2sgaGFzIG5vdCBiZWVuIGxvY2tlZCBmb3IgcmVhZGluZwAAmwcQAF0AAAA+AAAACQAAAAAAAAAEAAAABAAAADgAAAAhCRAATwAAAOcFAAAUAAAAIQkQAE8AAADnBQAAIQAAACEJEABPAAAA2wUAACEAAAAhCRAATwAAAGsEAAAkAAAASGFzaCB0YWJsZSBjYXBhY2l0eSBvdmVyZmxvd10EEAAmAAAAJAAAACgAAABlCBAASAAAAN8AAAA3AAAAZQgQAEgAAADgAAAAKwAAAGNhcGFjaXR5IG92ZXJmbG93AAAAKAwQAFAAAAAcAAAABQAAADkAAAAMAAAABAAAADoAAAA7AAAAPAAAAAAAAAAAAAAAAQAAAD0AAABhIGZvcm1hdHRpbmcgdHJhaXQgaW1wbGVtZW50YXRpb24gcmV0dXJuZWQgYW4gZXJyb3Igd2hlbiB0aGUgdW5kZXJseWluZyBzdHJlYW0gZGlkIG5vdAAAegYQAEgAAACPAgAADgAAAEVycm9yAgICAgICAgICAgIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKgBBAEBAQQBAgIAwAQCBAEJAgEB+wfPAQUBMS0BAQECAQIBASwBCwYKCwEBIwEKFRABZQgBCgEEIQEBAR4bWws6CwQBAgEYGCsDLAEHAgUJKTo3AQEBBAgEAQMHCgINAQ8BOgEEBAgBFAIaAQICOQEEAgQCAgMDAR4CAwELAjkBBAUBAgQBFAIWBgEBOgECAQEECAEHAgsCHgE9AQwBMgEDATcBAQMFAwEEBwILAh0BOgECAQYBBQIUAhwCOQIEBAgBFAIdAUgBBwMBAVoBAgcLCWIBAgkJAQEHSQIbAQEBAQE3DgEFAQIFCwEkCQFmBAEGAQICAhkCBAMQBA0BAgIGAQ8BXgEAAwADHQIeAh4CQAIBBwgBAgsDAQUBLQUzAUECIgF2AwQCCQEGA9sCAgE6AQEHAQEBAQIIBgoCAScBCC4CDBQEMAEBBQEBBQEoCQwCIAQCAgEDOAEBAgMBAQM6CAICQAZSAwENAQcEAQYBAwIyPw0BImUAAQEDCwMNAw0DDQIMBQgCCgECAQIFMQUBCgEBDQEQDTMhAAJxA30BDwFgIC8BAAEkBAMFBQFdBl0DAAEABgABYgQBCgEBHARQAg4iTgEXA2YEAwIIAQMBBAEZAgUBlwIaEg0BJggZCy4DMAECBAICEQEVAkIGAgICAgwBCAEjAQsBMwEBAwICBQIBARsBDgIFAgEBZAUJA3kBAgEEAQABkxEAEAMBDBAiAQIBqQEHAQYBCwEjAQEBLwEtAkMBFQMAAeIBlQUABgEqAQkAAwECBQQoAwQBpQIABCYBGgUBAQACGAE0BkYLMQR7ATYPKQECAgoDMQQCAgIBBAEKATIDJAUBCD4BDAI0CQoEAgFfAwIBAQIGAQIBnQEDCBUCOQIDASUHAwVGBg0BAQEBAQ4CVQgCAwEBFwFUBgEBBAIBAu4EBgIBAhsCVQgCAQECagEBAQIGAQFlAQEBAgQBBQAJAQIAAgEBBAGQBAICBAEgCigGAgQIAQkGAgMuDQECxgEBAwEByQcBBgEBUhYCBwECAQJ6BgMBAQIBBwEBSAIDAQEBQQEAAgsCNAUFAQEBFwEAEQYPAAwDAwAFOwcJBAADKAIAAT8RQAIBAg0CAAQBBwECAAIBBAAuAhcAAwkQAgceBJQDADcEMggBDgEWBQEPAAcBEQIHAQIBBQU+IQGgDgABPQQABf4C8wECAQcCBQEJAQAHbQgABQABHmCA8AAAcAAHAC0BAQECAQIBAUgLMBUQAWUHAgYCAgEEIwEeG1sLOgkJARgEAQkBAwEF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dSwAAAEAfiwBAMHVgCxiAQEA6ywCAQEA8iwAAAEAQKYsAQEAgKYaAQEAIqcMAQEAMqc8AQEAeacCAQEAfacAAPx1fqcIAQEAi6cAAAEAjacAANhakKcCAQEAlqcSAQEAqqcAALxaq6cAALFarKcAALVaracAAL9arqcAALxasKcAAO5asacAANZasqcAAOtas6cAAKADtKcOAQEAxKcAAND/xacAAL1axqcAAMh1x6cCAQEAy6cAAJlazKcOAQEA3KcAAL9Z9acAAAEAIf8ZACAAMAFpAAcDAAAABCcAKACwBCMAKABwBQoAJwB8BQ4AJwCMBQYAJwCUBQEAJwCADDIAQABQDRUAIACgGB8AIABAbh8AIACgbhgAGwAA6SEAIgCYSxAArAAAAKBPEAABAAAAqE8QAAwAAAACAAAAAAAAALACAABdE2ABEhfgIL0fICF8LCAvBTBgMxWg4DT4pGA2DKagNh774DYA/uBC/QFhQ4AHIUcBCuFHJA2hSKsOIUovGCFLOxnhWvMeYVswNKFjHmEhZfBqoWVAbSFmT2/hZvCvYWedvKFoAM9haWfR4WkA2mFqAOCha67iIW3r5CFv0Oihb/vzYXEBAO5x8AE/cgADAACDBCAAkQVgAF0ToAASFyAfDCBgH+8sYCsqMOArb6agLAKoIC0e+yAuAP5gNp7/oDb9ASE3AQphNyQNITirDqE5LxghOvMeIUtANKFTHmHhVPBqYVVPb+FVnbxhVgDPYVdl0aFXANohWADgoVmu4iFb7OThXNDoYV0gAO5e8AF/X8UBAACIHyAA/R8xAQBAAbgBtgGzAawBqAGhAZIBkAGMAYgBhAKSApACUwNdA5MDhQQMBAYFuwZOAAAAAAAAAAAAAAAA/wAAAPz//w8CqKqqqqqqqv///////wcA//0AAAD8//8AAAAAAAACgAAAAP////8Phar///////8AAAAA/////wAAAAD8////AAAAAAD////v/wAAAPz//wAAAQAA8P////8PAADA///////3/wP//8BDAAAAAP//AAAAAAAA//8AAACA//9//8D///8AAAD8AAAAAAAAAPgAAP//////9/z///cDAADwVNWqqqqqqqqqqqqqqqqqqqqqqqqqqqpV/wD/AP8A30A/AP8A/wD/P/////9iFdo/AAAAAAAAAD8gAAAAAACKPADE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';\n    const WASM_BYTE_LENGTH = 314699;\n\n    /**\n     * Hand-written JS glue for the dependency-free WASM module (no wasm-bindgen).\n     *\n     * WASM 二进制已内联为 base64（见 wasm-base64.ts），运行时通过 base64 解码 +\n     * WebAssembly.instantiate 加载，无需 fetch 外部 .wasm 文件。\n     * 这样打包后的 JS 库是单文件，可直接通过 CDN/UMD 引入。\n     */\n    let instance = null;\n    let initPromise = null;\n    let activeProgressReporter = null;\n    function exports$1() {\n        if (!instance)\n            throw new Error('wasm not initialized');\n        return instance.exports;\n    }\n    /** base64 string -> Uint8Array (length inferred from decoded content, or capped by `len`). */\n    function base64ToBytes(b64, len) {\n        if (typeof atob === 'function') {\n            const bin = atob(b64);\n            const n = len;\n            const out = new Uint8Array(n);\n            for (let i = 0; i < n; i++)\n                out[i] = bin.charCodeAt(i) & 0xff;\n            return out;\n        }\n        const g = globalThis;\n        const bytes = g.Buffer.from(b64, 'base64');\n        return bytes.subarray(0, len) ;\n    }\n    function initWasm() {\n        if (instance)\n            return Promise.resolve(instance);\n        if (!initPromise) {\n            initPromise = (async () => {\n                const bytes = base64ToBytes(WASM_BASE64, WASM_BYTE_LENGTH);\n                // WebAssembly.instantiate(bytes, imports) 在浏览器/DOM lib 下返回\n                // Promise<{ module, instance }>，但 WebWorker lib 下重载为 Promise<Instance>。\n                // 用 WebAssembly.Module + WebAssembly.Instance 显式两步避免重载歧义。\n                // TS 5.7+ Uint8Array.buffer 是 ArrayBufferLike，需断言为 BufferSource。\n                const module = await WebAssembly.compile(bytes);\n                instance = await WebAssembly.instantiate(module, {\n                    env: {\n                        report_progress(currentPage, totalPages) {\n                            if (!activeProgressReporter)\n                                return;\n                            activeProgressReporter({\n                                stage: 'rendering',\n                                currentPage: Math.max(1, Math.trunc(currentPage)),\n                                totalPages: Math.max(1, Math.trunc(totalPages)),\n                            });\n                        },\n                    },\n                });\n                return instance;\n            })();\n        }\n        return initPromise;\n    }\n    function copyIn(wasm, data) {\n        const ptr = wasm.alloc(data.length);\n        new Uint8Array(wasm.memory.buffer, ptr, data.length).set(data);\n        return ptr;\n    }\n    async function renderPdf(snapshot, encryption, onProgress) {\n        await initWasm();\n        const wasm = exports$1();\n        const inPtr = copyIn(wasm, snapshot);\n        const encPtr = encryption ? copyIn(wasm, encryption) : 0;\n        const encLen = encryption?.length ?? 0;\n        activeProgressReporter = onProgress ?? null;\n        try {\n            const outPtr = encryption\n                ? wasm.render_pdf_encrypted(inPtr, snapshot.length, encPtr, encLen)\n                : wasm.render_pdf(inPtr, snapshot.length);\n            const outLen = wasm.render_pdf_len();\n            if (outPtr === 0 || outLen === 0) {\n                if (outPtr !== 0)\n                    wasm.free_pdf(outPtr, outLen);\n                throw new Error('render_pdf failed: invalid snapshot or internal error');\n            }\n            // Copy out before freeing (memory may have grown during render; read fresh buffer).\n            const out = new Uint8Array(outLen);\n            out.set(new Uint8Array(wasm.memory.buffer, outPtr, outLen));\n            wasm.free_pdf(outPtr, outLen);\n            return out;\n        }\n        finally {\n            activeProgressReporter = null;\n            wasm.dealloc(inPtr, snapshot.length);\n            if (encPtr !== 0)\n                wasm.dealloc(encPtr, encLen);\n        }\n    }\n    async function inspectSnapshot(snapshot) {\n        await initWasm();\n        const wasm = exports$1();\n        const inPtr = copyIn(wasm, snapshot);\n        const ptr = wasm.inspect(inPtr, snapshot.length);\n        const len = wasm.inspect_len();\n        wasm.dealloc(inPtr, snapshot.length);\n        const bytes = new Uint8Array(wasm.memory.buffer, ptr, len);\n        return new TextDecoder().decode(bytes);\n    }\n    /** Count pages for a snapshot (function-form pageConfig needs totalPages). */\n    async function countPages(snapshot) {\n        await initWasm();\n        const wasm = exports$1();\n        const inPtr = copyIn(wasm, snapshot);\n        const total = wasm.count_pages(inPtr, snapshot.length);\n        wasm.dealloc(inPtr, snapshot.length);\n        return total;\n    }\n\n    self.onmessage = async (e) => {\n        const { id, op, snapshot } = e.data;\n        try {\n            if (op === 'inspect') {\n                const result = await inspectSnapshot(snapshot);\n                const message = { type: 'result', id, ok: true, result };\n                self.postMessage(message);\n            }\n            else if (op === 'countPages') {\n                const result = await countPages(snapshot);\n                const message = { type: 'result', id, ok: true, result };\n                self.postMessage(message);\n            }\n            else {\n                const result = await renderPdf(snapshot, e.data.encryption, (progress) => {\n                    const message = { type: 'progress', id, progress };\n                    self.postMessage(message);\n                });\n                const message = { type: 'result', id, ok: true, result };\n                self.postMessage(message, [result.buffer]);\n            }\n        }\n        catch (err) {\n            const message = {\n                type: 'result',\n                id,\n                ok: false,\n                error: err instanceof Error ? err.message : String(err),\n            };\n            self.postMessage(message);\n        }\n    };\n\n})();\n";
    var blob = new Blob([src], { type: 'application/javascript' });
    var url = URL.createObjectURL(blob);
    function Dom2pdfWorker() { return new Worker(url); }

    /**
     * dompdf — pure-frontend DOM-to-PDF.
     *
     * Pipeline: collectSnapshot (main thread, DOM) -> Worker -> WASM render_pdf -> PDF bytes.
     *
     * Public API mirrors dompdf.js: default export `dompdf(root, options) -> Promise<Blob>`,
     * plus named `exportPDF/renderToBytes/downloadPDF/inspect` for ergonomics.
     */
    let worker = null;
    let seq = 0;
    const pending = new Map();
    function emitProgress(onProgress, progress) {
        onProgress?.(progress);
    }
    function getWorker() {
        if (!worker) {
            worker = new Dom2pdfWorker();
            worker.onmessage = (e) => {
                const msg = e.data;
                const request = pending.get(msg.id);
                if (!request)
                    return;
                if (msg.type === 'progress') {
                    request.onProgress?.(msg.progress);
                    return;
                }
                pending.delete(msg.id);
                request.resolve(msg);
            };
            worker.onerror = (e) => {
                console.error('dompdf worker error', e);
                // Reject all in-flight requests so their Promises and closures (snapshot
                // buffers, onProgress) can be released instead of hanging forever.
                const err = new Error('dompdf worker crashed');
                for (const req of pending.values())
                    req.reject(err);
                pending.clear();
                worker = null;
            };
        }
        return worker;
    }
    function callWorker(snapshot, op, options) {
        const id = ++seq;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject, onProgress: options?.onProgress });
            // Transfer the snapshot buffer (we don't need it on the main thread after).
            const transfer = snapshot.buffer.byteLength > 0 ? [snapshot.buffer] : [];
            getWorker().postMessage({ id, op, snapshot }, transfer);
        });
    }
    /**
     * Build the final snapshot bytes, handling function-form pageConfig via a
     * two-phase count_pages -> resolve -> encode flow.
     */
    async function buildSnapshot(root, options) {
        emitProgress(options.onProgress, { stage: 'collecting' });
        const data = await collectSnapshotData(root, options);
        const pagination = options.pagination ?? false;
        const needsPerPageHF = pageConfigNeedsPerPageResolution(options.pageConfig);
        const needsPerPageWatermark = watermarkNeedsPerPageResolution(options.watermark);
        const needsTotalPages = pagination && (needsPerPageHF
            || needsPerPageWatermark);
        let totalPages = 1;
        if (needsTotalPages) {
            emitProgress(options.onProgress, { stage: 'countingPages' });
            // Phase 1: count pages with the sampled band heights.
            const prelim = encodeSnapshot(data, [], []);
            const countRes = await callWorker(prelim, 'countPages');
            if (!countRes.ok || typeof countRes.result !== 'number' || countRes.result < 1) {
                throw new Error(countRes.error || 'count_pages failed');
            }
            totalPages = countRes.result;
            emitProgress(options.onProgress, { stage: 'countingPages', totalPages });
        }
        if (!needsPerPageHF && !needsPerPageWatermark) {
            return {
                snapshot: encodeSnapshot(data, []),
                totalPages: pagination ? totalPages : 1,
            };
        }
        // Phase 2: resolve per-page HF / watermark text (JS resolves placeholders).
        let perPageHF = [];
        if (needsPerPageHF) {
            if (typeof options.pageConfig === 'function') {
                perPageHF = resolvePerPageHF(options.pageConfig, totalPages);
            }
            else if (options.pageConfig) {
                perPageHF = resolveStaticPageConfigHF(options.pageConfig, totalPages);
            }
            perPageHF = resolvePerPageHFText(perPageHF, totalPages);
        }
        let perPageWatermark = [];
        if (needsPerPageWatermark) {
            let resolved = [];
            const watermarkImageCache = new Map();
            if (typeof options.watermark === 'function') {
                resolved = await resolvePerPageWatermark(options.watermark, totalPages, data.images, watermarkImageCache);
            }
            else if (options.watermark) {
                resolved = await resolveStaticWatermarkPages(options.watermark, totalPages, data.images, watermarkImageCache);
            }
            perPageWatermark = resolvePerPageWatermarkText(resolved, totalPages);
        }
        return {
            snapshot: encodeSnapshot(data, perPageHF, perPageWatermark),
            totalPages: pagination ? totalPages : 1,
        };
    }
    /** Collect a snapshot and render it to PDF bytes (off main thread). */
    async function renderToBytes(root, options) {
        const resolvedOptions = options ?? {};
        performance.now();
        const buildStartedAt = performance.now();
        const { snapshot, totalPages } = await buildSnapshot(root, resolvedOptions);
        performance.now() - buildStartedAt;
        emitProgress(resolvedOptions.onProgress, {
            stage: 'rendering',
            totalPages,
        });
        const workerStartedAt = performance.now();
        const res = await callWorker(snapshot, 'render', {
            onProgress: (progress) => emitProgress(resolvedOptions.onProgress, {
                ...progress,
                totalPages: progress.totalPages ?? totalPages,
            }),
        });
        performance.now() - workerStartedAt;
        if (!res.ok || !res.result || typeof res.result === 'string') {
            throw new Error(res.error || 'render failed');
        }
        emitProgress(resolvedOptions.onProgress, {
            stage: 'done',
            totalPages,
            currentPage: totalPages,
        });
        return res.result;
    }
    /** Render and return a Blob ready for download / preview. */
    async function exportPDF(root, options) {
        const bytes = await renderToBytes(root, options);
        // renderPdf returns an independent, exact-length buffer that the worker transfers.
        return new Blob([bytes.buffer], { type: 'application/pdf' });
    }
    /** Trigger a browser download of the exported PDF. */
    async function downloadPDF(root, options, filename = 'export.pdf') {
        const blob = await exportPDF(root, options);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    /** Debug: return a WASM-side summary string (node/image/font/page counts). */
    async function inspect(root, options) {
        const { snapshot } = await buildSnapshot(root, options ?? {});
        const res = await callWorker(snapshot, 'inspect');
        if (!res.ok || typeof res.result !== 'string')
            throw new Error(res.error || 'inspect failed');
        return res.result;
    }
    /**
     * Default export - dompdf.js-compatible entry point.
     *
     *   dompdf(root, options) -> Promise<Blob>
     *
     * Legacy clone/html2canvas/jsPDF options are accepted for upgrade compatibility
     * and normalized inside `snapshot.ts`. Unsupported behaviors emit warnings
     * instead of failing hard. `onJspdfReady` / `onJspdfFinish` are still no-ops
     * because this engine has no jsPDF instance. `compress` enables real DEFLATE
     * compression of PDF streams (content streams, fonts, raw-RGB images).
     */
    const dompdfFn = (root, options) => exportPDF(root, options);
    const dompdf = Object.assign(dompdfFn, {
        default: exportPDF,
        exportPDF,
        renderToBytes,
        downloadPDF,
        inspect,
        collectSnapshot,
        collectSnapshotData,
        encodeSnapshot,
        computePageBreaks,
    });
    // Browser-friendly global for direct <script> usage.
    if (typeof globalThis !== 'undefined') {
        globalThis.dompdf = dompdf;
    }

    exports.collectSnapshot = collectSnapshot;
    exports.collectSnapshotData = collectSnapshotData;
    exports.computePageBreaks = computePageBreaks;
    exports.default = dompdf;
    exports.downloadPDF = downloadPDF;
    exports.encodeSnapshot = encodeSnapshot;
    exports.exportPDF = exportPDF;
    exports.inspect = inspect;
    exports.pageConfigNeedsPerPageResolution = pageConfigNeedsPerPageResolution;
    exports.renderToBytes = renderToBytes;
    exports.resolvePerPageHF = resolvePerPageHF;
    exports.resolvePerPageWatermark = resolvePerPageWatermark;
    exports.resolveStaticPageConfigHF = resolveStaticPageConfigHF;
    exports.resolveStaticWatermarkPages = resolveStaticWatermarkPages;
    exports.watermarkNeedsPerPageResolution = watermarkNeedsPerPageResolution;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=dompdf.js.map
