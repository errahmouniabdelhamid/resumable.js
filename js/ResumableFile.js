import ResumableChunk from './ResumableChunk.js';
import ResumableHelpers, { DebugVerbosityLevel, ResumableChunkStatus } from './ResumableHelpers.js';
import ResumableEventHandler from './ResumableEventHandler.js';

/**
 * A single file object that should be uploaded in multiple chunks
 */
export default class ResumableFile extends ResumableEventHandler {
  constructor(file, uniqueIdentifier, fileCategory, options) {
    super();
    this.opts = options;
    this.setInstanceProperties(options);
    this._file = file;
    this._fileName = file.name;
    this._size = file.size;
    this._relativePath = file.webkitRelativePath || this._fileName;
    this._uniqueIdentifier = uniqueIdentifier;
    this._fileCategory = fileCategory;
    this._error = uniqueIdentifier !== undefined;
    this._chunks = [];
    this._prevProgress = 0;
    this.isPaused = false;

    // Bootstrap file
    this.fire('chunkingStart', this);
    this.bootstrap();
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Constructed ResumableFile.', this);
  }

  /**
   * Set the options provided inside the configuration object on this instance
   */
  setInstanceProperties(options) {
    this.chunkSize = options.chunkSize || 1024 * 1024; // 1 MB
    this.debugVerbosityLevel = options.debugVerbosityLevel || DebugVerbosityLevel.NONE;
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Set ResumableFile instance properties.', this);
  }

  get file() {
    return this._file;
  }

  get fileName() {
    return this._fileName;
  }

  get size() {
    return this._size;
  }

  get relativePath() {
    return this._relativePath;
  }

  get uniqueIdentifier() {
    return this._uniqueIdentifier;
  }

  get fileCategory() {
    return this._fileCategory;
  }

  get chunks() {
    return this._chunks;
  }

  /**
   * Stop current uploads for this file
   */
  abort() {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Aborting upload of ResumableFile...', this);
    let abortCount = 0;
    for (const chunk of this._chunks) {
      if (chunk.status === ResumableChunkStatus.UPLOADING) {
        chunk.abort();
        abortCount++;
      }
    }
    if (abortCount > 0) this.fire('fileProgress', this, null);
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Aborted upload of ResumableFile.', this);
  }

  /**
   * Cancel uploading this file and remove it from the file list
   */
  cancel() {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Cancelling upload of ResumableFile...', this);
    for (const chunk of this._chunks) {
      if (chunk.status === ResumableChunkStatus.UPLOADING) {
        chunk.abort();
        this.fire('chunkCancel', chunk);
      }
    }
    // Reset this file to be void
    this._chunks = [];
    this.fire('fileCancel', this);
    this.fire('fileProgress', this, null);
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Cancelled upload of ResumableFile.', this);
  }

  /**
   * Retry uploading this file
   */
  retry() {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Retrying upload of ResumableFile...', this);
    this.bootstrap();
    let firedRetry = false;
    this.on('chunkingComplete', () => {
      if (!firedRetry) this.fire('fileRetry', this, null);
      firedRetry = true;
    });
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Retried upload of ResumableFile.', this);
  }

  /**
   * Prepare this file for a new upload, by dividing it into multiple chunks
   */
  bootstrap() {
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Bootstrapping and chunking ResumableFile...', this);
    const progressHandler = (message, chunk) => {
      this.fire('chunkProgress', chunk, message);
      this.fire('fileProgress', this, message);
    };
    const retryHandler = (message, chunk) => {
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handling "chunkRetry" in ResumableFile...', this, chunk, message);
      this.fire('chunkRetry', chunk, message);
      this.fire('fileRetry', this, message);
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handled "chunkRetry" in ResumableFile.', this, chunk, message);
    }
    const successHandler = (message, chunk) => {
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handling "chunkSuccess" in ResumableFile...', this, chunk, message);
      if (this._error) return;
      this.fire('chunkSuccess', chunk, message);
      this.fire('fileProgress', this, message);
      if (this.isComplete) {
        this.fire('fileSuccess', this, message);
      }
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handled "chunkSuccess" in ResumableFile.', this, chunk, message);
    };
    const errorHandler = (message, chunk) => {
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handling "chunkError" in ResumableFile...', this, chunk, message);
      this.fire('chunkError', chunk, message);
      this.abort();
      this._error = true;
      this._chunks = [];
      this.fire('fileError', this, message);
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handled "chunkError" in ResumableFile.', this, chunk, message);
    }

    this.abort();
    this._error = false;
    // Rebuild stack of chunks from file
    this._chunks = [];
    this._prevProgress = 0;
    const maxOffset = Math.max(Math.ceil(this._size / this.chunkSize), 1);
    for (var offset = 0; offset < maxOffset; offset++) {
      const chunk = new ResumableChunk(this, offset, this.opts);
      chunk.on('chunkProgress', (message) => progressHandler(message, chunk));
      chunk.on('chunkError', (message) => errorHandler(message, chunk));
      chunk.on('chunkSuccess', (message) => successHandler(message, chunk));
      chunk.on('chunkRetry', (message) => retryHandler(message, chunk));
      this._chunks.push(chunk);
      this.fire('chunkingProgress', this, offset / maxOffset);
    }
    this.fire('chunkingComplete', this);
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Bootstrapped and chunked ResumableFile.', this);
  }

  /**
   * Get the progress for uploading this file based on the progress of the individual file chunks
   */
  progress() {
    if (this._error) return 1;
    // Sum up progress across everything
    var ret = 0;
    var error = false;
    for (const chunk of this._chunks) {
      if (chunk.status === ResumableChunkStatus.ERROR) error = true;
      ret += chunk.progress(true); // get chunk progress relative to entire file
    }
    ret = error ? 1 : (ret > 0.99999 ? 1 : ret);
    ret = Math.max(this._prevProgress, ret); // We don't want to lose percentages when an upload is paused
    this._prevProgress = ret;
    return ret;
  }

  /**
   * Check whether at least one of this file's chunks is currently uploading
   */
  get isUploading() {
    return this._chunks.some((chunk) => chunk.status === ResumableChunkStatus.UPLOADING);
  }

  /**
   * Check whether all of this file's chunks completed their upload requests and whether it should be
   * treated as completed.
   */
  get isComplete() {
    return !this._chunks.some((chunk) =>
      chunk.status === ResumableChunkStatus.PENDING || chunk.status === ResumableChunkStatus.UPLOADING);
  }

  /**
   * Initiate the upload of a new chunk for this file. This function returns whether a new upload was started or not.
   */
  upload() {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Starting upload of next chunk of ResumableFile...', this);
    if (this.isPaused) {
      return false;
    }

    for (const chunk of this._chunks) {
      if (chunk.status === ResumableChunkStatus.PENDING) {
        chunk.send();
        ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Started upload of next chunk of ResumableFile.', this);
        return true;
      }
    }

    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'No chunk found to upload for ResumableFile.', this);
    return false;
  }

  /**
   * Mark a given number of chunks as already uploaded to the server.
   */
  markChunksCompleted(chunkNumber) {
    ResumableHelpers.printDebugLow(
      this.debugVerbosityLevel,
      'Marking ' + chunkNumber + ' chunks as complete for ResumableFile...',
      this
    );
    if (!this._chunks || this._chunks.length <= chunkNumber) {
      return;
    }
    for (let num = 0; num < chunkNumber; num++) {
      this._chunks[num].markComplete();
    }
    ResumableHelpers.printDebugLow(
      this.debugVerbosityLevel,
      'Marked ' + chunkNumber + ' chunks as complete for ResumableFile.',
      this
    );
  }
}
