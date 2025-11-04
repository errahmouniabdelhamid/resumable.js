/**
 * Internal helper methods
 */
export default class ResumableHelpers {
  /**
   * Stop the propagation and default behavior of the given event `e`.
   */
  static stopEvent(e) {
    e.stopPropagation();
    e.preventDefault();
  }

  /**
   * Generate a unique identifier for the given file based on its size and filename.
   */
  static generateUniqueIdentifier(file) {
    // Remove special characters
    return (file.size + '-' + file.name.replace(/[^0-9a-zA-Z_-]/img, ''));
  }

  /**
   * Flatten the given array and all contained subarrays.
   */
  static flattenDeep(array) {
    return Array.isArray(array)
      ? array.reduce((a, b) => a.concat(this.flattenDeep(b)), [])
      : [array];
  }

  /**
   * Filter the given array based on the predicate inside `callback`
   * and executes `errorCallback` for duplicate elements.
   */
  static uniqBy(array, callback, errorCallback) {
    let seen = new Set();
    return array.filter((item) => {
      let k = callback(item);
      if (seen.has(k)) {
        errorCallback(item);
        return false;
      } else {
        seen.add(k);
        return true;
      }
    });
  }

  /**
   * Format the size given in Bytes in a human readable format.
   */
  static formatSize(size) {
    if (size < 1024) {
      return size + ' bytes';
    }
    if (size < 1024 * 1024) {
      return (size / 1024.0).toFixed(0) + ' KB';
    }
    if (size < 1024 * 1024 * 1024) {
      return (size / 1024.0 / 1024.0).toFixed(1) + ' MB';
    }
    return (size / 1024.0 / 1024.0 / 1024.0).toFixed(1) + ' GB';
  }

  /**
   * Get the target url for the specified request type and params
   */
  static getTarget(requestType, sendTarget, testTarget, params, parameterNamespace = '') {
    let target = sendTarget;

    if (requestType === 'test' && testTarget) {
      target = testTarget === '/' ? sendTarget : testTarget;
    }

    let separator = target.indexOf('?') < 0 ? '?' : '&';
    let joinedParams = Object.entries(params).map(([key, value]) => [
      encodeURIComponent(parameterNamespace + key),
      encodeURIComponent(value),
    ].join('=')).join('&');

    if (joinedParams) target = target + separator + joinedParams;

    return target;
  }

  /**
   * If given debugVerbosityLevel is LOW or higher, print message to debug log.
   */
  static printDebugLow(debugVerbosityLevel, message, ...args) {
    if (debugVerbosityLevel === 1 || debugVerbosityLevel === 2) {
      console.debug(message, ...args);
    }
  }

  /**
   * If given debugVerbosityLevel is HIGH, print message to debug log.
   */
  static printDebugHigh(debugVerbosityLevel, message, ...args) {
    if (debugVerbosityLevel === 2) {
      console.debug(message, ...args);
    }
  }
}

/**
 * Debug verbosity levels
 */
export const DebugVerbosityLevel = {
  NONE: 0,
  LOW: 1,
  HIGH: 2,
};

/**
 * Chunk status constants
 */
export const ResumableChunkStatus = {
  PENDING: 'chunkPending',
  UPLOADING: 'chunkUploading',
  SUCCESS: 'chunkSuccess',
  ERROR: 'chunkError',
};
