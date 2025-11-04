import ResumableHelpers, { DebugVerbosityLevel, ResumableChunkStatus } from './ResumableHelpers.js';
import ResumableFile from './ResumableFile.js';
import ResumableEventHandler from './ResumableEventHandler.js';

/**
 * An instance of a resumable upload handler that contains one or multiple files which should be uploaded in chunks.
 * Modified to use Livewire's native upload functionality.
 */
export class Resumable extends ResumableEventHandler {
  constructor(options = {}) {
    super();
    this.opts = options;
    this.files = {};
    this.uncompletedFileCategories = [];
    this.validators = {};
    
    // Store bound event handlers to prevent memory leaks
    this._boundHandlers = new WeakMap();
    this._dragHandlers = {
      dragover: this.onDragOverEnter.bind(this),
      dragenter: this.onDragOverEnter.bind(this),
      dragleave: this.onDragLeave.bind(this),
      drop: this.removeDragOverClassAndCallOnDrop.bind(this)
    };
    
    // Define default configuration (optimization #18 - use object spread)
    const defaults = {
      clearInput: true,
      dragOverClass: 'dragover',
      fileCategories: [],
      defaultFileCategory: 'default',
      fileTypes: [],
      fileTypeErrorCallback: (file) => {
        alert(`${file.fileName || file.name} has an unsupported file type.`);
      },
      generateUniqueIdentifier: null,
      maxFileSize: undefined,
      maxFileSizeErrorCallback: (file) => {
        alert(file.fileName || file.name + ' is too large, please upload files less than ' +
          ResumableHelpers.formatSize(this.maxFileSize) + '.');
      },
      maxFiles: undefined,
      maxFilesErrorCallback: (files) => {
        alert('Please upload no more than ' + this.maxFiles + ' file' + (this.maxFiles === 1 ? '' : 's') + ' at a time.');
      },
      minFileSize: 1,
      minFileSizeErrorCallback: (file) => {
        alert(file.fileName || file.name + ' is too small, please upload files larger than ' +
          ResumableHelpers.formatSize(this.minFileSize) + '.');
      },
      prioritizeFirstAndLastChunk: false,
      fileValidationErrorCallback: (file) => {},
      simultaneousUploads: 3,
      debugVerbosityLevel: DebugVerbosityLevel.NONE,
      
      // Livewire-specific configuration
      livewireComponent: null,
      livewireProperty: 'upload',
    };
    
    // Apply defaults, then override with user options using spread (optimization #18)
    this.setInstanceProperties({...defaults, ...options});
    this.checkSupport();
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Constructed Resumable.', this);
  }

  /**
   * Check whether the current browser supports the essential functions for the package to work.
   */
  checkSupport() {
    this.support =
      typeof File !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof FileList !== 'undefined' &&
      !!Blob.prototype.slice;
    if (!this.support) {
      throw new Error('Not supported by Browser');
    }
  }

  /**
   * Assign the attributes of this instance via destructuring of the options object.
   */
  setInstanceProperties(options) {
    Object.assign(this, options);

    // Explicitly test for null because other falsy values could be used as default.
    if (this.defaultFileCategory === null) {
      if (this.fileCategories.length === 0) {
        throw new Error('If no default category is set, at least one file category must be defined.');
      }
    } else if (!this.fileCategories.includes(this.defaultFileCategory)) {
      this.fileCategories.push(this.defaultFileCategory);
    }

    // Deduplicate file categories
    const deduplicatedFileCategories = [];
    this.fileCategories.forEach((fileCategory) => {
      if (this.files[fileCategory]) {
        return;
      }

      this.files[fileCategory] = [];
      this.uncompletedFileCategories.push(fileCategory);
      deduplicatedFileCategories.push(fileCategory);
    });

    this.fileCategories = deduplicatedFileCategories.slice();

    // Create/Check file types object.
    if (Array.isArray(this.fileTypes)) {
      const fileTypes = this.fileTypes.slice();
      this.fileTypes = {};
      this.fileCategories.forEach((fileCategory) => {
        this.fileTypes[fileCategory] = fileTypes.slice();
      });
    } else {
      const fileTypeCategories = Object.keys(this.fileTypes);
      this.fileCategories.forEach((fileCategory) => {
        if (!fileTypeCategories.includes(fileCategory)) {
          this.fileTypes[fileCategory] = [];
        }
      });
    }

    this.sanitizeFileTypes();
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Set Resumable instance properties.', this);
  }

  sanitizeFileTypes() {
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Sanitizing file types...');
    Object.keys(this.fileTypes).forEach((fileCategory) => {
      this.fileTypes[fileCategory] = this.fileTypes[fileCategory].map((type) => type.replace(/[\s.]/g, '').toLowerCase());
    });
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Sanitized file types.');
  }

  throwIfUnknownFileCategory(fileCategory) {
    if (!this.fileCategories.includes(fileCategory)) {
      throw new Error('Unknown file category: ' + fileCategory);
    }
  }

  /**
   * Transforms a single fileEntry or directoryEntry item into a list of File objects
   */
  async mapDirectoryItemToFile(item, path) {
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Mapping directory item to file (' + path + ')...', item);
    if (item.isFile) {
      const file = await new Promise(
        (resolve, reject) => item.file(resolve, reject)
      );
      file.relativePath = path + file.name;
      ResumableHelpers.printDebugHigh(
        this.debugVerbosityLevel,
        'Mapped directory item (FileSystemFileEntry) to file (' + path + ').',
        file
      );
      return [file];
    } else if (item.isDirectory) {
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Directory item contains new directory (' + path + ').');
      return await this.processDirectory(item, path + item.name + '/');
    } else if (item instanceof File) {
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Directory item already is a file (' + path + ').');
      return [item];
    }

    console.warn('Item mapping did not return a file object. This might be due to an unknown file type.')
    return [];
  }

  /**
   * Transforms a single DataTransfer item into a File object.
   */
  async mapDragItemToFile(item, path) {
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Mapping drag item to file (' + path + ')...', item);
    let entry = item.webkitGetAsEntry();
    if (entry.isDirectory) {
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Drag item contains new directory (' + path + ').');
      return await this.processDirectory(entry, path + entry.name + '/');
    }

    let file = item.getAsFile();
    if (file instanceof File) {
      file.relativePath = path + file.name;
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Mapped drag item to file (' + path + ').', file);
      return [file];
    }

    console.warn('Item mapping did not return a file object. This might be due to an unknown file type.')
    return [];
  }

  /**
   * Recursively traverse a directory and collect files to upload
   */
  processDirectory(directory, path) {
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Processing directory (' + path + ')...', directory);
    return new Promise((resolve, reject) => {
      const dirReader = directory.createReader();
      let allEntries = [];

      const readEntries = () => {
        dirReader.readEntries(async (entries) => {
          if (entries.length) {
            allEntries = allEntries.concat(entries);
            return readEntries();
          }

          ResumableHelpers.printDebugHigh(
            this.debugVerbosityLevel,
            'Read all entries from directory (' + path + ').',
            allEntries
          );
          allEntries = allEntries.map((entry) => {
            return this.mapDirectoryItemToFile(entry, path);
          });
          resolve(await Promise.all(allEntries));
          ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Processed directory (' + path + ').');
        }, reject);
      };

      readEntries();
    });
  }

  /**
   * Remove drag over class and call onDrop
   */
  removeDragOverClassAndCallOnDrop(e) {
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Removing drag over class and calling onDrop...', e);
    const domNode = e.currentTarget;
    domNode.classList.remove(this.dragOverClass);
    const fileCategory = domNode.getAttribute('resumable-file-category');

    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Removed drag over class.');

    this.throwIfUnknownFileCategory(fileCategory);

    return this.onDrop(e, fileCategory);
  }

  /**
   * Handle the event when a new file was provided via drag-and-drop
   */
  async onDrop(e, fileCategory = this.defaultFileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling onDrop...', e, fileCategory);
    ResumableHelpers.stopEvent(e);

    let items = [];

    if (e.dataTransfer && e.dataTransfer.items) {
      items = [...e.dataTransfer.items];
    } else if (e.dataTransfer && e.dataTransfer.files) {
      items = [...e.dataTransfer.files];
    }

    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Collected items in onDrop.', items);

    if (!items.length) {
      return;
    }
    this.fire('fileProcessingBegin', items, fileCategory);
    let promises = items.map((item) => this.mapDragItemToFile(item, ''));
    let files = ResumableHelpers.flattenDeep(await Promise.all(promises));
    if (files.length) {
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Handling files in onDrop...', files);
      this.appendFilesFromFileList(files, e, fileCategory);
    }

    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled onDrop.');
  }

  /**
   * Handle the event when a drag-and-drop item leaves the area
   */
  onDragLeave(e) {
    e.currentTarget.classList.remove(this.dragOverClass);
  }

  /**
   * Handle the event when a drag-and-drop item enters the area
   */
  onDragOverEnter(e) {
    e.preventDefault();
    let dt = e.dataTransfer;
    if (dt.types.includes('Files')) {
      e.stopPropagation();
      dt.dropEffect = 'copy';
      dt.effectAllowed = 'copy';
      e.currentTarget.classList.add(this.dragOverClass);
    } else {
      dt.dropEffect = 'none';
      dt.effectAllowed = 'none';
    }
  }

  /**
   * Validate and clean a list of files.
   */
  async validateFiles(files, fileCategory = this.defaultFileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Validating files....', files, fileCategory);
    if (!this.fileCategories.includes(fileCategory)) {
      this.fire('fileProcessingFailed', undefined, 'unknownFileCategory', fileCategory);
      ResumableHelpers.printDebugLow(
        this.debugVerbosityLevel,
        'File validation failed because of "unknownFileCategory".',
        fileCategory
      );
      return;
    }

    // Remove duplicates
    let filesWithoutDuplicates = ResumableHelpers.uniqBy(files,
      (file) => file.uniqueIdentifier,
      (file) => this.fire('fileProcessingFailed', file, 'duplicate', fileCategory),
    );

    // Build Set of existing identifiers for O(1) lookup
    const existingIdentifiers = new Set(
      this.files[fileCategory].map(f => f.uniqueIdentifier)
    );

    const validationResults = [];
    const allowedTypes = this.fileTypes[fileCategory];
    const hasTypeRestrictions = allowedTypes && allowedTypes.length > 0;

    for (const file of filesWithoutDuplicates) {
      // Check if already added - O(1) with Set
      if (existingIdentifiers.has(file.uniqueIdentifier)) {
        this.fire('fileProcessingFailed', file, 'duplicate', fileCategory);
        ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'File validation failed because of "duplicate".', file);
        validationResults.push(false);
        continue;
      }

      // Validate file size early (fast check)
      if (this.minFileSize !== undefined && file.size < this.minFileSize) {
        this.fire('fileProcessingFailed', file, 'minFileSize', fileCategory);
        this.minFileSizeErrorCallback(file);
        ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'File validation failed because of "minFileSize".', file);
        validationResults.push(false);
        continue;
      }
      if (this.maxFileSize !== undefined && file.size > this.maxFileSize) {
        this.fire('fileProcessingFailed', file, 'maxFileSize', fileCategory);
        this.maxFileSizeErrorCallback(file);
        validationResults.push(false);
        continue;
      }

      // Validate file type
      if (hasTypeRestrictions) {
        const fileType = file.type.toLowerCase();
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        const fileTypeFound = allowedTypes.some((type) => {
          return fileExtension === type ||
            type.includes('/') && (
              type.includes('*') &&
              fileType.substring(0, type.indexOf('*')) === type.substring(0, type.indexOf('*')) ||
              fileType === type
            );
        });
        
        if (!fileTypeFound) {
          this.fire('fileProcessingFailed', file, 'fileType', fileCategory);
          this.fileTypeErrorCallback(file);
          ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'File validation failed because of "fileType".', file);
          validationResults.push(false);
          continue;
        }
      }

      // Custom validator  
      const fileExtension = file.name.split('.').pop().toLowerCase();
      if (fileExtension in this.validators && !await this.validators[fileExtension](file, fileCategory)) {
        this.fire('fileProcessingFailed', file, 'validation', fileCategory);
        this.fileValidationErrorCallback(file);
        ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'File validation failed because of "validation".', file);
        validationResults.push(false);
        continue;
      }

      validationResults.push(true);
    }

    const validatedFiles = filesWithoutDuplicates.filter((_v, index) => validationResults[index]);

    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Successfully validated files.', validatedFiles);

    return validatedFiles;
  }

  /**
   * Add an array of files to this instance's file list
   */
  async appendFilesFromFileList(fileList, event, fileCategory = this.defaultFileCategory) {
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Appending files from list...', fileList, event, fileCategory);
    const resumableFiles = this.files[fileCategory];

    if (!resumableFiles) {
      this.fire('fileProcessingFailed', undefined, 'unknownFileCategory', fileCategory);
      ResumableHelpers.printDebugHigh(
        this.debugVerbosityLevel,
        'Can\'t append files from list, because of "unknownFileCategory"',
        fileCategory
      );
      return false;
    }

    const allResumableFiles = this.getFilesOfAllCategories();

    // Check for max files
    if (this.maxFiles !== undefined && this.maxFiles < fileList.length + allResumableFiles.length) {
      if (this.maxFiles === 1 && allResumableFiles.length === 1 && fileList.length === 1) {
        ResumableHelpers.printDebugHigh(this.debugVerbosityLevel,'Replacing already added file, because of single-file upload.');
        this.removeFile(resumableFiles[0]);
      } else {
        this.fire('fileProcessingFailed', undefined, 'maxFiles', fileCategory);
        this.maxFilesErrorCallback(fileList);
        ResumableHelpers.printDebugHigh(
          this.debugVerbosityLevel,
          'Can\'t append files from list, because of "maxFiles"',
          {maxFiles: this.maxFiles, alreadyAddedFilesCount: allResumableFiles.length, newFilesCount: fileList.length}
        );
        return false;
      }
    }

    // Add unique identifiers
    const filesWithUniqueIdentifiers = await Promise.all(fileList.map(async (file) => {
      file.uniqueIdentifier = await this.callGenerateUniqueIdentifier(file, event, fileCategory);
      return file;
    }));

    // Validate files
    const validatedFiles = await this.validateFiles(filesWithUniqueIdentifiers, fileCategory);

    let skippedFiles = filesWithUniqueIdentifiers.filter((file) => !validatedFiles.includes(file));

    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel,'Creating ResumableFiles for every file from file list...');
    for (const file of validatedFiles) {
      let f = new ResumableFile(file, file.uniqueIdentifier, fileCategory, this.opts);
      f.on('chunkingStart', (...args) => this.handleChunkingStart(args, fileCategory));
      f.on('chunkingProgress', (...args) => this.handleChunkingProgress(args, fileCategory));
      f.on('chunkingComplete', (...args) => this.handleChunkingComplete(args, fileCategory));
      f.on('chunkSuccess', (...args) => this.handleChunkSuccess(args, fileCategory));
      f.on('chunkError', (...args) => this.handleChunkError(args, fileCategory));
      f.on('chunkCancel', (...args) => this.handleChunkCancel(args, fileCategory));
      f.on('chunkRetry', (...args) => this.handleChunkRetry(args, fileCategory));
      f.on('chunkProgress', (...args) => this.handleChunkProgress(args, fileCategory));
      f.on('fileProgress', (...args) => this.handleFileProgress(args, fileCategory));
      f.on('fileError', (...args) => this.handleFileError(args, fileCategory));
      f.on('fileSuccess', (...args) => this.handleFileSuccess(args, fileCategory));
      f.on('fileCancel', (...args) => this.handleFileCancel(args, fileCategory));
      f.on('fileRetry', (...args) => this.handleFileRetry(args, fileCategory));
      this.files[fileCategory].push(f);
      this.fire('fileAdded', f, event, fileCategory);
      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel,'Created ResumableFile.', file, f);
    }
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel,'Created ResumableFiles for every file from file list.');

    if (!validatedFiles.length && !skippedFiles.length) {
      return;
    }
    this.fire('filesAdded', validatedFiles, skippedFiles, fileCategory);

    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Appended all files from list.');
  }

  /**
   * Generate a new unique identifier for a given file
   */
  callGenerateUniqueIdentifier(file, event, fileCategory = this.defaultFileCategory) {
    return typeof this.generateUniqueIdentifier === 'function' ?
      this.generateUniqueIdentifier(file, event, fileCategory) : ResumableHelpers.generateUniqueIdentifier(file);
  }

  /**
   * Queue a new chunk to be uploaded
   */
  uploadNextChunk() {
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Queueing next chunk upload...');
    const allResumableFiles = this.getFilesOfAllCategories();

    if (this.prioritizeFirstAndLastChunk) {
      for (const file of allResumableFiles) {
        if (file.chunks.length && file.chunks[0].status === ResumableChunkStatus.PENDING) {
          file.chunks[0].send();
          ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Queued upload of prioritized first chunk.', file);
          return;
        }
        if (file.chunks.length > 1 && file.chunks[file.chunks.length - 1].status === ResumableChunkStatus.PENDING) {
          file.chunks[file.chunks.length - 1].send();
          ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Queued upload of prioritized last chunk.', file);
          return;
        }
      }
    }

    // Look for next chunk to upload
    for (const file of allResumableFiles) {
      if (file.upload()) {
        ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Queued upload of next chunk.', file);
        return;
      }
    }
  }

  /**
   * Returns all ResumableFiles of all file categories.
   */
  getFilesOfAllCategories() {
    let allFiles = [];

    this.fileCategories.forEach((fileCategory) => {
      allFiles = allFiles.concat(this.files[fileCategory]);
    });

    return allFiles;
  }

  /**
   * PUBLIC METHODS
   */

  /**
   * Assign a browse action to one or more DOM nodes.
   */
  assignBrowse(domNodes, isDirectory = false, fileCategory = this.defaultFileCategory) {
    ResumableHelpers.printDebugLow(
      this.debugVerbosityLevel,
      'Assigning browse to DOM nodes...',
      domNodes,
      {isDirectory: isDirectory},
      fileCategory
    );
    this.throwIfUnknownFileCategory(fileCategory);

    if (domNodes instanceof HTMLElement) domNodes = [domNodes];
    for (const domNode of domNodes) {
      let input;
      if (domNode instanceof HTMLInputElement && domNode.type === 'file') {
        input = domNode;
      } else {
        input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.style.display = 'none';
        domNode.addEventListener('click', () => {
          input.style.opacity = 0;
          input.style.display = 'block';
          input.focus();
          input.click();
          input.style.display = 'none';
        }, false);
        domNode.appendChild(input);
      }
      if (this.maxFiles !== 1) {
        input.setAttribute('multiple', 'multiple');
      } else {
        input.removeAttribute('multiple');
      }
      if (isDirectory) {
        input.setAttribute('webkitdirectory', 'webkitdirectory');
      } else {
        input.removeAttribute('webkitdirectory');
      }

      this.setFileTypes(this.fileTypes[fileCategory], input, fileCategory);

      input.addEventListener(
        'change',
        (event) => {
          this.handleChangeEvent(event, fileCategory);
        },
        false
      );

      ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Added input (for browse) to DOM node.', domNode, input);
    }
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Assigned browse to DOM nodes.', domNodes);
  }

  /**
   * Assign one or more DOM nodes as a drop target.
   */
  assignDrop(domNodes, fileCategory = this.defaultFileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Assigning drop to DOM nodes...', domNodes, fileCategory);
    this.throwIfUnknownFileCategory(fileCategory);

    if (domNodes instanceof HTMLElement) domNodes = [domNodes];

    for (const domNode of domNodes) {
      if (fileCategory) {
        domNode.setAttribute('resumable-file-category', fileCategory);
      }

      // Use pre-bound handlers to prevent memory leaks
      domNode.addEventListener('dragover', this._dragHandlers.dragover, false);
      domNode.addEventListener('dragenter', this._dragHandlers.dragenter, false);
      domNode.addEventListener('dragleave', this._dragHandlers.dragleave, false);
      domNode.addEventListener('drop', this._dragHandlers.drop, false);
    }
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Assigned drop to DOM nodes.', domNodes);
  }

  /**
   * Remove one or more DOM nodes as a drop target.
   */
  unAssignDrop(domNodes) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Unassigning drop from DOM nodes...', domNodes);
    if (domNodes instanceof HTMLElement) domNodes = [domNodes];

    for (const domNode of domNodes) {
      // Use pre-bound handlers for proper cleanup
      domNode.removeEventListener('dragover', this._dragHandlers.dragover);
      domNode.removeEventListener('dragenter', this._dragHandlers.dragenter);
      domNode.removeEventListener('dragleave', this._dragHandlers.dragleave);
      domNode.removeEventListener('drop', this._dragHandlers.drop);
    }
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Unassigned drop from DOM nodes.', domNodes);
  }

  /**
   * Set the file types allowed to upload.
   */
  setFileTypes(fileTypes, domNode = null, fileCategory = this.defaultFileCategory) {
    ResumableHelpers.printDebugLow(
      this.debugVerbosityLevel,
      'Setting file types for DOM node...',
      fileTypes,
      domNode,
      fileCategory
    );
    this.throwIfUnknownFileCategory(fileCategory);

    if (domNode && domNode.type !== 'file') {
      throw new Error('Dom node is not a file input.');
    }

    this.fileTypes[fileCategory] = fileTypes;
    this.sanitizeFileTypes();

    if (domNode) {
      if (fileTypes.length >= 1) {
        domNode.setAttribute('accept', this.fileTypes[fileCategory].map((type) => {
          if (type.match(/^[^.][^/]+$/)) {
            type = '.' + type;
          }
          return type;
        }).join(','));
      } else {
        domNode.removeAttribute('accept');
      }
    }

    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Set file types for DOM node.');
  }

  /**
   * Check whether any files are currently uploading
   */
  get isUploading() {
    return this.getFilesOfAllCategories().some((file) => file.isUploading);
  }

  /**
   * Start or resume the upload
   */
  upload() {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Starting Upload...');
    if (this.isUploading) {
      ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Already uploading. Not starting again.');
      return;
    }
    this.fire('uploadStart');
    for (let num = 1; num <= this.simultaneousUploads; num++) {
      ResumableHelpers.printDebugHigh(
        this.debugVerbosityLevel,
        'Starting simultaneous upload ' + num + ' / ' + this.simultaneousUploads + '...',
      );
      this.uploadNextChunk();
      ResumableHelpers.printDebugHigh(
        this.debugVerbosityLevel,
        'Started simultaneous upload ' + num + ' / ' + this.simultaneousUploads + '...',
      );
    }
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Started Upload.');
  }

  /**
   * Pause the upload
   */
  pause() {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Pausing Upload...');
    for (const file of this.getFilesOfAllCategories()) {
      file.abort();
    }
    this.fire('pause');
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Paused Upload.');
  }

  /**
   * Cancel uploading and reset all files
   */
  cancel() {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Cancelling Upload...');
    this.fire('beforeCancel');
    const allFiles = this.getFilesOfAllCategories();
    allFiles.forEach((file) => {
      file.cancel();
    });

    this.fire('cancel');
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Cancelled Upload.');
  }

  /**
   * Return the progress of the current upload
   */
  progress() {
    let totalDone = this.getFilesOfAllCategories().reduce((accumulator, file) => accumulator + file.size * file.progress(), 0);
    let totalSize = this.getSize();
    return totalSize > 0 ? totalDone / totalSize : 0;
  }

  /**
   * Add a HTML5 File object to the list of files.
   */
  addFile(file, event, fileCategory = this.defaultFileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Adding file...', file, event, fileCategory);
    this.throwIfUnknownFileCategory(fileCategory);

    this.appendFilesFromFileList([file], event, fileCategory);
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Added file.', file);
  }

  /**
   * Add a list of HTML5 File objects to the list of files.
   */
  addFiles(files, event, fileCategory = this.defaultFileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Adding files...', files, event, fileCategory);
    this.throwIfUnknownFileCategory(fileCategory);

    this.appendFilesFromFileList(files, event, fileCategory);
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Added files.', files);
  }

  /**
   * Add a validator function for the given file type.
   */
  addFileValidator(fileType, validator) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Adding file validator for file type...', fileType);
    if (fileType in this.validators) {
      console.warn(`Overwriting validator for file type: ${fileType}`);
    }
    this.validators[fileType] = validator;
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Added file validator for file type.', fileType);
  }

  /**
   * Remove the given resumable file from the file list
   */
  removeFile(file) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Removing file...', file);
    const fileCategory = file.fileCategory;
    const fileIndex = this.files[fileCategory].findIndex(
      (fileFromArray) => fileFromArray.uniqueIdentifier === file.uniqueIdentifier
    );

    if (fileIndex >= 0) {
      this.files[fileCategory].splice(fileIndex, 1);
    }
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Removed file.', file);
  }

  /**
   * Retrieve a ResumableFile object from the file list by its unique identifier.
   */
  getFromUniqueIdentifier(uniqueIdentifier) {
    return this.getFilesOfAllCategories().find((file) => file.uniqueIdentifier === uniqueIdentifier);
  }

  /**
   * Get the combined size of all files for the upload
   */
  getSize() {
    return this.getFilesOfAllCategories().reduce((accumulator, file) => accumulator + file.size, 0);
  }

  /**
   * Call the event handler for a DragEvent
   */
  handleDropEvent(e, fileCategory = this.defaultFileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling drop event...', e, fileCategory);
    this.throwIfUnknownFileCategory(fileCategory);

    this.onDrop(e, fileCategory);
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled drop event.');
  }

  /**
   * Call the event handler for an InputEvent
   */
  handleChangeEvent(e, fileCategory = this.defaultFileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling change event...', e, fileCategory);
    this.throwIfUnknownFileCategory(fileCategory);

    const eventTarget = e.target;
    this.fire('fileProcessingBegin', eventTarget.files, fileCategory);
    this.appendFilesFromFileList([...eventTarget.files], e, fileCategory);
    if (this.clearInput) {
      eventTarget.value = '';
    }
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled change event.');
  }

  /**
   * Check whether the upload is completed
   */
  checkUploadComplete() {
    ResumableHelpers.printDebugHigh(this.debugVerbosityLevel, 'Checking for upload completion...');
    if (this.getFilesOfAllCategories().length === 0) {
      return;
    }

    const stillUncompletedFileCategories = [];
    this.uncompletedFileCategories.forEach((fileCategory) => {
      if (this.files[fileCategory].length == 0) {
        return;
      }

      if (this.files[fileCategory].every((file) => file.isComplete)) {
        this.fire('categoryComplete', fileCategory);
      } else {
        stillUncompletedFileCategories.push(fileCategory);
      }
    });

    this.uncompletedFileCategories = stillUncompletedFileCategories;

    if (this.uncompletedFileCategories.length === 0) {
      this.fire('complete');
    }

    ResumableHelpers.printDebugHigh(
      this.debugVerbosityLevel,
      'Checked for upload completion. Upload completed: ' + (this.uncompletedFileCategories.length ? 'no' : 'yes')
    );
  }

  /**
   * Event Handlers
   */

  handleChunkingStart(args, fileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling "chunkingStart" in main resumable object...', args);
    this.fire('chunkingStart', ...args, fileCategory);
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled "chunkingStart" in main resumable object.', args);
  }

  handleChunkingProgress(args, fileCategory) {
    this.fire('chunkingProgress', ...args, fileCategory);
  }

  handleChunkingComplete(args, fileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling "chunkingComplete" in main resumable object...', args);
    this.fire('chunkingComplete', ...args, fileCategory);
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled "chunkingComplete" in main resumable object.', args);
  }

  handleChunkSuccess(args, fileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling "chunkSuccess" in main resumable object...', args);
    this.fire('chunkSuccess', ...args, fileCategory);
    this.uploadNextChunk();
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled "chunkSuccess" in main resumable object.', args);
  }

  handleChunkError(args, fileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling "chunkError" in main resumable object...', args);
    this.fire('chunkError', ...args, fileCategory);
    this.uploadNextChunk();
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled "chunkError" in main resumable object.', args);
  }

  handleChunkCancel(args, fileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling "chunkCancel" in main resumable object...', args);
    this.fire('chunkCancel', ...args, fileCategory);
    this.uploadNextChunk();
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled "chunkCancel" in main resumable object.', args);
  }

  handleChunkRetry(args, fileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling "chunkRetry" in main resumable object...', args);
    this.fire('chunkRetry', ...args, fileCategory);
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled "chunkRetry" in main resumable object.', args);
  }

  handleChunkProgress(args, fileCategory) {
    this.fire('chunkProgress', ...args, fileCategory);
  }

  handleFileError(args, fileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling "fileError" in main resumable object...', args);
    this.fire('fileError', ...args, fileCategory);
    this.fire('error', args[1], args[0], fileCategory);
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled "fileError" in main resumable object.', args);
  }

  handleFileSuccess(args, fileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling "fileSuccess" in main resumable object...', args);
    this.fire('fileSuccess', ...args, fileCategory);
    this.checkUploadComplete();
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled "fileSuccess" in main resumable object.', args);
  }

  handleFileProgress(args, fileCategory) {
    this.fire('fileProgress', ...args, fileCategory);
    this.fire('progress');
  }

  handleFileCancel(args, fileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling "fileCancel" in main resumable object...', args);
    this.fire('fileCancel', ...args, fileCategory);
    this.removeFile(args[0]);
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled "fileCancel" in main resumable object.', args);
  }

  handleFileRetry(args, fileCategory) {
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handling "fileRetry" in main resumable object...', args);
    this.fire('fileRetry', ...args, fileCategory);
    this.upload();
    ResumableHelpers.printDebugLow(this.debugVerbosityLevel, 'Handled "fileRetry" in main resumable object.', args);
  }
}

export default Resumable;
