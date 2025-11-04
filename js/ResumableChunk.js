import ResumableHelpers, { DebugVerbosityLevel, ResumableChunkStatus } from './ResumableHelpers.js';
import ResumableEventHandler from './ResumableEventHandler.js';

/**
 * A file chunk that contains all the data for a single upload request
 * Modified to use Livewire's native upload functionality instead of XHR
 */
export default class ResumableChunk extends ResumableEventHandler {
  constructor(fileObj, offset, options) {
    super();
    this.setInstanceProperties(options);
    this.fileObj = fileObj;
    this.fileObjSize = fileObj.size;
    this.fileObjType = fileObj.file.type;
    this.offset = offset;

    this.lastProgressCallback = new Date();
    this.tested = false;
    this.retries = 0;
    this.pendingRetry = false;
    this.isMarkedComplete = false;
    this.loaded = 0;
    
    // Computed properties
    this.startByte = this.offset * this.chunkSize;
    this.endByte = Math.min(this.fileObjSize, (this.offset + 1) * this.chunkSize);
    this.uploadPromise = null;
    
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Constructed ResumableChunk.', this);
  }

  /**
   * Set the options provided inside the configuration object on this instance
   */
  setInstanceProperties(options) {
    // Option properties with defaults
    this.chunkSize = options.chunkSize || 1024 * 1024; // 1 MB
    this.fileParameterName = options.fileParameterName || 'file';
    this.chunkNumberParameterName = options.chunkNumberParameterName || 'resumableChunkNumber';
    this.chunkSizeParameterName = options.chunkSizeParameterName || 'resumableChunkSize';
    this.currentChunkSizeParameterName = options.currentChunkSizeParameterName || 'resumableCurrentChunkSize';
    this.totalSizeParameterName = options.totalSizeParameterName || 'resumableTotalSize';
    this.typeParameterName = options.typeParameterName || 'resumableType';
    this.identifierParameterName = options.identifierParameterName || 'resumableIdentifier';
    this.fileCategoryParameterName = options.fileCategoryParameterName || 'resumableFileCategory';
    this.fileNameParameterName = options.fileNameParameterName || 'resumableFilename';
    this.relativePathParameterName = options.relativePathParameterName || 'resumableRelativePath';
    this.totalChunksParameterName = options.totalChunksParameterName || 'resumableTotalChunks';
    this.throttleProgressCallbacks = options.throttleProgressCallbacks !== undefined ? options.throttleProgressCallbacks : 0.5;
    this.query = options.query || {};
    this.headers = options.headers || {};
    this.method = options.method || 'multipart';
    this.uploadMethod = options.uploadMethod || 'POST';
    this.testMethod = options.testMethod || 'GET';
    this.parameterNamespace = options.parameterNamespace || '';
    this.testChunks = options.testChunks !== undefined ? options.testChunks : true;
    this.maxChunkRetries = options.maxChunkRetries || 100;
    this.chunkRetryInterval = options.chunkRetryInterval;
    this.permanentErrors = options.permanentErrors || [400, 401, 403, 404, 409, 415, 500, 501];
    this.withCredentials = options.withCredentials || false;
    this.xhrTimeout = options.xhrTimeout || 0;
    this.chunkFormat = options.chunkFormat || 'blob';
    this.setChunkTypeFromFile = options.setChunkTypeFromFile || false;
    this.target = options.target || '/';
    this.testTarget = options.testTarget || '';
    this.debugVerbosityLevel = options.debugVerbosityLevel || DebugVerbosityLevel.NONE;
    
    // Livewire-specific options
    this.livewireComponent = options.livewireComponent || null;
    this.livewireProperty = options.livewireProperty || 'upload';
    
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Set ResumableChunk instance properties.', this);
  }

  /**
   * Get query parameters for this chunk as an object, combined with custom parameters if provided
   */
  get formattedQuery() {
    var customQuery = this.query;
    if (typeof customQuery == 'function') customQuery = customQuery(this.fileObj, this);

    // Add extra data to identify chunk
    const extraData = {
      [this.chunkNumberParameterName]: this.offset + 1,
      [this.chunkSizeParameterName]: this.chunkSize,
      [this.currentChunkSizeParameterName]: this.endByte - this.startByte,
      [this.totalSizeParameterName]: this.fileObjSize,
      [this.typeParameterName]: this.fileObjType,
      [this.identifierParameterName]: this.fileObj.uniqueIdentifier,
      [this.fileCategoryParameterName]: this.fileObj.fileCategory,
      [this.fileNameParameterName]: this.fileObj.fileName,
      [this.relativePathParameterName]: this.fileObj.relativePath,
      [this.totalChunksParameterName]: this.fileObj.chunks.length,
    };
    return {...extraData, ...customQuery};
  }

  /**
   * Determine the status for this Chunk based on different parameters
   */
  get status() {
    if (this.pendingRetry) {
      return ResumableChunkStatus.UPLOADING;
    } else if (this.isMarkedComplete) {
      return ResumableChunkStatus.SUCCESS;
    } else if (!this.uploadPromise) {
      return ResumableChunkStatus.PENDING;
    } else if (this.uploadPromise.isPending) {
      return ResumableChunkStatus.UPLOADING;
    } else if (this.uploadPromise.isSuccess) {
      return ResumableChunkStatus.SUCCESS;
    } else if (this.retries >= this.maxChunkRetries) {
      return ResumableChunkStatus.ERROR;
    } else {
      this.abort();
      return ResumableChunkStatus.PENDING;
    }
  }

  /**
   * Get the target url for the specified request type and the configured parameters of this chunk
   */
  getTarget(requestType) {
    return ResumableHelpers.getTarget(requestType, this.target, this.testTarget, this.formattedQuery, this.parameterNamespace);
  }

  /**
   * Makes a GET request without any data to see if the chunk has already been uploaded in a previous session
   */
  test() {
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Sending test request for ResumableChunk...', this);
    
    // For Livewire, we'll use a simple fetch request for testing
    fetch(this.getTarget('test'), {
      method: this.testMethod,
      credentials: this.withCredentials ? 'include' : 'same-origin',
    })
      .then(response => {
        ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handling test request response for ResumableChunk...', this);
        this.tested = true;
        if (response.ok) {
          this.fire('chunkSuccess', this.message());
        } else {
          this.send();
        }
        ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handled test request response for ResumableChunk.', this);
      })
      .catch(() => {
        this.tested = true;
        this.send();
      });
      
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Sent test request for ResumableChunk.', this);
  }

  /**
   * Abort and reset a request
   */
  abort() {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Aborting upload of ResumableChunk...', this);
    if (this.uploadPromise && this.uploadPromise.cancel) {
      this.uploadPromise.cancel();
    }
    this.uploadPromise = null;
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Aborted upload of ResumableChunk.', this);
  }

  /**
   * Uploads the actual data using Livewire's upload functionality
   */
  send() {
    if (this.testChunks && !this.tested) {
      ResumableHelpers.printDebugLow(
        this.debugVerbosityLevel,
        'Testing upload status of ResumableChunk before uploading...',
        this
      );
      this.test();
      ResumableHelpers.printDebugLow(
        this.debugVerbosityLevel,
        'Tested upload status of ResumableChunk before uploading. Chunk already uploaded: '
          + (this.status === ResumableChunkStatus.SUCCESS ? 'yes' : 'no'),
        this
      );
      return;
    }

    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Starting upload of ResumableChunk...', this);

    // Create the chunk blob
    let bytes = this.fileObj.file.slice(this.startByte, this.endByte,
      this.setChunkTypeFromFile ? this.fileObj.file.type : '');

    // Create a File object with metadata
    const chunkFileName = `${this.fileObj.fileName}.chunk.${this.offset + 1}`;
    const chunkFile = new File([bytes], chunkFileName, {
      type: this.setChunkTypeFromFile ? this.fileObj.file.type : 'application/octet-stream'
    });

    // Add metadata as a property (Livewire will send this along with the file)
    chunkFile.metadata = this.formattedQuery;

    this.loaded = 0;
    this.pendingRetry = false;
    this.fire('chunkProgress', this.message());

    // Use Livewire's upload function
    if (this.livewireComponent) {
      ResumableHelpers.printDebugHigh(
        this.debugVerbosityLevel,
        'Using Livewire upload for ResumableChunk...',
        this
      );

      // Store the upload promise
      this.uploadPromise = {
        isPending: true,
        isSuccess: false,
        cancel: null
      };

      try {
        // Use Livewire's $wire.upload() method
        const uploadResult = this.livewireComponent.upload(
          this.livewireProperty,
          chunkFile,
          (result) => {
            // Success callback
            ResumableHelpers.printDebugHigh(
              this.debugVerbosityLevel,
              'Livewire upload success for ResumableChunk.',
              this
            );
            this.uploadPromise.isPending = false;
            this.uploadPromise.isSuccess = true;
            this.loaded = this.endByte - this.startByte;
            this.fire('chunkSuccess', result);
          },
          (error) => {
            // Error callback
            ResumableHelpers.printDebugHigh(
              this.debugVerbosityLevel,
              'Livewire upload error for ResumableChunk.',
              this,
              error
            );
            this.uploadPromise.isPending = false;
            this.uploadPromise.isSuccess = false;
            this.handleUploadError(error);
          },
          (event) => {
            // Progress callback
            if (event.detail && event.detail.progress !== undefined) {
              const progress = event.detail.progress;
              this.loaded = Math.floor((this.endByte - this.startByte) * progress / 100);
              
              if (Date.now() - this.lastProgressCallback.getTime() > this.throttleProgressCallbacks * 1000) {
                this.fire('chunkProgress', this.message());
                this.lastProgressCallback = new Date();
              }
            }
          }
        );

        // Store cancel function if available
        if (uploadResult && uploadResult.cancel) {
          this.uploadPromise.cancel = uploadResult.cancel;
        }
      } catch (error) {
        const errorMsg = `Error initiating Livewire upload for chunk ${this.offset + 1}/${this.fileObj.chunks.length} of file "${this.fileObj.fileName}": ${error.message}`;
        console.error(errorMsg, error);
        this.handleUploadError(error);
      }
    } else {
      // Fallback: If no Livewire component is provided, show an error
      const errorMsg = `No Livewire component provided for chunk upload (file: ${this.fileObj.fileName}, chunk: ${this.offset + 1}/${this.fileObj.chunks.length}). Please set livewireComponent in Resumable options using the @this or $wire reference from your Livewire component.`;
      console.error(errorMsg);
      this.fire('chunkError', errorMsg);
    }

    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Started upload of ResumableChunk.', this);
  }

  /**
   * Handle upload errors and retry logic
   */
  handleUploadError(error) {
    const status = this.status;
    if (status === ResumableChunkStatus.ERROR) {
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handling "chunkError" in ResumableChunk...', this);
      this.fire('chunkError', this.message());
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handled "chunkError" in ResumableChunk.', this);
    } else {
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handling "chunkRetry" in ResumableChunk...', this);
      this.fire('chunkRetry', this.message());
      this.abort();
      this.retries++;
      let retryInterval = this.chunkRetryInterval;
      if (retryInterval !== undefined) {
        this.pendingRetry = true;
        setTimeout(() => this.send(), retryInterval);
      } else {
        this.send();
      }
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handled "chunkRetry" in ResumableChunk.', this);
    }
  }

  /**
   * Return the response message
   */
  message() {
    return this.uploadPromise && this.uploadPromise.response ? this.uploadPromise.response : '';
  }

  /**
   * Return the progress for the current chunk as a number between 0 and 1
   */
  progress(relative = false) {
    var factor = relative ? (this.endByte - this.startByte) / this.fileObjSize : 1;
    if (this.pendingRetry) return 0;
    if ((!this.uploadPromise || !this.uploadPromise.isSuccess) && !this.isMarkedComplete) factor *= .95;
    switch (this.status) {
      case ResumableChunkStatus.SUCCESS:
      case ResumableChunkStatus.ERROR:
        return factor;
      case ResumableChunkStatus.PENDING:
        return 0;
      default:
        return this.loaded / (this.endByte - this.startByte) * factor;
    }
  }

  /**
   * Mark this chunk as completed because it was already uploaded to the server.
   */
  markComplete() {
    this.isMarkedComplete = true;
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Marked ResumableChunk as complete.', this);
  }
}
