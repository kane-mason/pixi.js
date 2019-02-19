import { Rectangle, Texture } from '../';
import { getResolutionOfUrl } from '../utils';

/**
 * Utility class for maintaining reference to a collection
 * of Textures on a single Spritesheet.
 *
 * To access a sprite sheet from your code pass its JSON data file to Pixi's loader:
 *
 * ```js
 * PIXI.loader.add("images/spritesheet.json").load(setup);
 *
 * function setup() {
 *   let sheet = PIXI.loader.resources["images/spritesheet.json"].spritesheet;
 *   ...
 * }
 * ```
 * With the `sheet.textures` you can create Sprite objects,`sheet.animations` can be used to create an AnimatedSprite.
 *
 * Sprite sheets can be packed using tools like {@link https://codeandweb.com/texturepacker|TexturePacker},
 * {@link https://renderhjs.net/shoebox/|Shoebox} or {@link https://github.com/krzysztof-o/spritesheet.js|Spritesheet.js}.
 * Default anchor points (see {@link PIXI.Texture#defaultAnchor}) and grouping of animation sprites are currently only
 * supported by TexturePacker.
 *
 * @class
 * @memberof PIXI
 */
export default class Spritesheet
{
    /**
     * The maximum number of Textures to build per process.
     *
     * @type {number}
     * @default 1000
     */
    static get BATCH_SIZE()
    {
        return 1000;
    }

    /**
     * @param {PIXI.BaseTexture} baseTexture Reference to the source BaseTexture object.
     * @param {Object} data - Spritesheet image data.
     * @param {string} [resolutionFilename] - The filename to consider when determining
     *        the resolution of the spritesheet. If not provided, the imageUrl will
     *        be used on the BaseTexture.
     */
    constructor(baseTexture, data, resolutionFilename = null)
    {
        /**
         * Reference to ths source texture
         * @type {PIXI.BaseTexture}
         */
        this.baseTexture = baseTexture;

        /**
         * A map containing all textures of the sprite sheet.
         * Can be used to create a {@link PIXI.Sprite|Sprite}:
         * ```js
         * new PIXI.Sprite(sheet.textures["image.png"]);
         * ```
         * @member {Object}
         */
        this.textures = {};

        /**
         * A map containing the textures for each animation.
         * Can be used to create an {@link PIXI.extras.AnimatedSprite|AnimatedSprite}:
         * ```js
         * new PIXI.extras.AnimatedSprite(sheet.animations["anim_name"])
         * ```
         * @member {Object}
         */
        this.animations = {};

        /**
         * Reference to the original JSON data.
         * @type {Object}
         */
        this.data = data;

        /**
         * The resolution of the spritesheet.
         * @type {number}
         */
        this.resolution = this._updateResolution(
            resolutionFilename || this.baseTexture.imageUrl
        );

        /**
         * Map of spritesheet frames.
         * @type {Object}
         * @private
         */
        this._frames = this.data.frames;

        /**
         * Collection of frame names.
         * @type {string[]}
         * @private
         */
        this._frameKeys = Object.keys(this._frames);

        /**
         * Current batch index being processed.
         * @type {number}
         * @private
         */
        this._batchIndex = 0;

        /**
         * Callback when parse is completed.
         * @type {Function}
         * @private
         */
        this._callback = null;
    }

    /**
     * Generate the resolution from the filename or fallback
     * to the meta.scale field of the JSON data.
     *
     * @private
     * @param {string} resolutionFilename - The filename to use for resolving
     *        the default resolution.
     * @return {number} Resolution to use for spritesheet.
     */
    _updateResolution(resolutionFilename)
    {
        const scale = this.data.meta.scale;

        // Use a defaultValue of `null` to check if a url-based resolution is set
        let resolution = getResolutionOfUrl(resolutionFilename, null);

        // No resolution found via URL
        if (resolution === null)
        {
            // Use the scale value or default to 1
            resolution = scale !== undefined ? parseFloat(scale) : 1;
        }

        // For non-1 resolutions, update baseTexture
        if (resolution !== 1)
        {
            this.baseTexture.resolution = resolution;
            this.baseTexture.update();
        }

        return resolution;
    }

    /**
     * Parser spritesheet from loaded data. This is done asynchronously
     * to prevent creating too many Texture within a single process.
     *
     * @param {Function} callback - Callback when complete returns
     *        a map of the Textures for this spritesheet.
     */
    parse(callback)
    {
        this._batchIndex = 0;
        this._callback = callback;

        if (this._frameKeys.length <= Spritesheet.BATCH_SIZE)
        {
            this._processFrames(0);
            this._processAnimations();
            this._parseComplete();
        }
        else
        {
            this._nextBatch();
        }
    }

    /**
     * Process a batch of frames
     *
     * @private
     * @param {number} initialFrameIndex - The index of frame to start.
     */
    _processFrames(initialFrameIndex)
    {
        const meta = this.data.meta;
        let frameIndex = initialFrameIndex;
        const maxFrames = Spritesheet.BATCH_SIZE;
        const sourceScale = this.baseTexture.sourceScale;

        while (frameIndex - initialFrameIndex < maxFrames && frameIndex < this._frameKeys.length)
        {
            const i = this._frameKeys[frameIndex];
            const data = this._frames[i];
            const rect = data.frame;

            if (rect)
            {
                let frame = null;
                let trim = null;
                const sourceSize = data.trimmed !== false && data.sourceSize
                    ? data.sourceSize : data.frame;

                const orig = new Rectangle(
                    0,
                    0,
                    Math.floor(sourceSize.w * sourceScale) / this.resolution,
                    Math.floor(sourceSize.h * sourceScale) / this.resolution
                );

                if (data.rotated)
                {
                    frame = new Rectangle(
                        Math.floor(rect.x * sourceScale) / this.resolution,
                        Math.floor(rect.y * sourceScale) / this.resolution,
                        Math.floor(rect.h * sourceScale) / this.resolution,
                        Math.floor(rect.w * sourceScale) / this.resolution
                    );
                }
                else
                {
                    frame = new Rectangle(
                        Math.floor(rect.x * sourceScale) / this.resolution,
                        Math.floor(rect.y * sourceScale) / this.resolution,
                        Math.floor(rect.w * sourceScale) / this.resolution,
                        Math.floor(rect.h * sourceScale) / this.resolution
                    );
                }

                //  Check to see if the sprite is trimmed
                if (data.trimmed !== false && data.spriteSourceSize)
                {
                    trim = new Rectangle(
                        Math.floor(data.spriteSourceSize.x * sourceScale) / this.resolution,
                        Math.floor(data.spriteSourceSize.y * sourceScale) / this.resolution,
                        Math.floor(rect.w * sourceScale) / this.resolution,
                        Math.floor(rect.h * sourceScale) / this.resolution
                    );
                }

                this.textures[i] = new Texture(
                    this.baseTexture,
                    frame,
                    orig,
                    trim,
                    data.rotated ? 2 : 0,
                    data.anchor
                );

                if (data.vertices)
                {
                    const vertices = new Float32Array(data.vertices.length * 2);

                    for (let i = 0; i < data.vertices.length; i++)
                    {
                        vertices[i * 2] = Math.floor(data.vertices[i][0] * sourceScale) / this.resolution;
                        vertices[(i * 2) + 1] = Math.floor(data.vertices[i][1] * sourceScale) / this.resolution;
                    }

                    const uvs = new Float32Array(data.verticesUV.length * 2);

                    for (let i = 0; i < data.verticesUV.length; i++)
                    {
                        uvs[i * 2] = data.verticesUV[i][0] / meta.size.w;
                        uvs[(i * 2) + 1] = data.verticesUV[i][1] / meta.size.h;
                    }

                    const indices = new Uint16Array(data.triangles.length * 3);
                    for (let i = 0; i < data.triangles.length; i++)
                    {
                        indices[i * 3] = data.triangles[i][0];
                        indices[(i * 3) + 1] = data.triangles[i][1];
                        indices[(i * 3) + 2] = data.triangles[i][2];
                    }

                    this.textures[i].polygon = new TexturePolygon(vertices, uvs, indices);
                }

                // lets also add the frame to pixi's global cache for fromFrame and fromImage functions
                Texture.addToCache(this.textures[i], i);
            }

            frameIndex++;
        }
    }

    /**
     * Parse animations config
     *
     * @private
     */
    _processAnimations()
    {
        const animations = this.data.animations || {};

        for (const animName in animations)
        {
            this.animations[animName] = [];
            for (const frameName of animations[animName])
            {
                this.animations[animName].push(this.textures[frameName]);
            }
        }
    }

    /**
     * The parse has completed.
     *
     * @private
     */
    _parseComplete()
    {
        const callback = this._callback;

        this._callback = null;
        this._batchIndex = 0;
        callback.call(this, this.textures);
    }

    /**
     * Begin the next batch of textures.
     *
     * @private
     */
    _nextBatch()
    {
        this._processFrames(this._batchIndex * Spritesheet.BATCH_SIZE);
        this._batchIndex++;
        setTimeout(() =>
        {
            if (this._batchIndex * Spritesheet.BATCH_SIZE < this._frameKeys.length)
            {
                this._nextBatch();
            }
            else
            {
                this._processAnimations();
                this._parseComplete();
            }
        }, 0);
    }

    /**
     * Destroy Spritesheet and don't use after this.
     *
     * @param {boolean} [destroyBase=false] Whether to destroy the base texture as well
     */
    destroy(destroyBase = false)
    {
        for (const i in this.textures)
        {
            this.textures[i].destroy();
        }
        this._frames = null;
        this._frameKeys = null;
        this.data = null;
        this.textures = null;
        if (destroyBase)
        {
            this.baseTexture.destroy();
        }
        this.baseTexture = null;
    }
}
