# Resumable.js - Livewire Edition

A JavaScript library for providing multiple simultaneous, stable, fault-tolerant and resumable/restartable uploads using **Livewire v3's native upload functionality** instead of traditional XHR requests.

## What's Different?

This version replaces the traditional XMLHttpRequest-based uploads with Livewire v3's `$wire.upload()` and `$wire.uploadMultiple()` methods, while maintaining all the powerful features of resumable.js:

- ✅ **Chunked uploads** - Files are split into manageable chunks
- ✅ **Resume capability** - Uploads can be paused and resumed
- ✅ **Progress tracking** - Real-time upload progress for each file and chunk
- ✅ **Event system** - Rich event API for monitoring upload lifecycle
- ✅ **File validation** - Type, size, and custom validation
- ✅ **Multiple files** - Simultaneous upload of multiple files
- ✅ **Drag & drop** - Full drag-and-drop support
- ✅ **File categories** - Organize uploads into categories

## Installation

```bash
npm install @pointcloudtechnology/resumablejs
```

Or use the built files directly from the `dist` directory.

## Quick Start

### 1. In Your Livewire Component

```php
<?php

namespace App\Http\Livewire;

use Livewire\Component;
use Livewire\WithFileUploads;

class FileUploader extends Component
{
    use WithFileUploads;

    public $upload;
    
    public function render()
    {
        return view('livewire.file-uploader');
    }
    
    public function updatedUpload()
    {
        // Handle the uploaded chunk
        // The chunk will include metadata about which chunk it is
        // You can reassemble chunks on the server side
        
        $this->validate([
            'upload' => 'file|max:102400', // 100MB max
        ]);
        
        // Process the chunk...
    }
}
```

### 2. In Your Blade Template

```html
<div>
    <div id="drop-zone" wire:ignore>
        <button id="browse-button">Select Files</button>
        <div id="file-list"></div>
    </div>

    <script type="module">
        import Resumable from './dist/resumable-livewire.es.js';

        // Get the Livewire component reference
        const component = @this;

        // Initialize Resumable with Livewire
        const resumable = new Resumable({
            livewireComponent: component,
            livewireProperty: 'upload',
            chunkSize: 1024 * 1024, // 1MB chunks
            simultaneousUploads: 3,
            testChunks: false,
            maxFileSize: 100 * 1024 * 1024, // 100MB
        });

        // Assign browse and drop
        resumable.assignBrowse(document.getElementById('browse-button'));
        resumable.assignDrop(document.getElementById('drop-zone'));

        // Listen to events
        resumable.on('fileAdded', (file) => {
            console.log('File added:', file.fileName);
            resumable.upload(); // Auto-start upload
        });

        resumable.on('fileProgress', (file) => {
            console.log('Progress:', Math.round(file.progress() * 100) + '%');
        });

        resumable.on('fileSuccess', (file, message) => {
            console.log('File uploaded:', file.fileName);
        });

        resumable.on('complete', () => {
            console.log('All files uploaded!');
        });
    </script>
</div>
```

## Configuration Options

All the original resumable.js options are supported, plus Livewire-specific options:

```javascript
const resumable = new Resumable({
    // Livewire-specific options
    livewireComponent: component,     // Required: The Livewire component instance
    livewireProperty: 'upload',       // Required: The property name for uploads
    
    // Standard resumable.js options
    chunkSize: 1024 * 1024,          // 1MB chunks
    simultaneousUploads: 3,           // Upload 3 chunks at once
    testChunks: false,                // Test if chunks exist before uploading
    maxFileSize: 100 * 1024 * 1024,  // 100MB max file size
    maxFiles: undefined,              // No limit on number of files
    fileTypes: ['jpg', 'png', 'pdf'], // Allowed file types (empty = all)
    minFileSize: 1,                   // Minimum file size
    
    // Callbacks
    fileTypeErrorCallback: (file) => {
        alert(`${file.name} has an unsupported file type.`);
    },
    maxFileSizeErrorCallback: (file) => {
        alert(`${file.name} is too large.`);
    },
    
    // Other options
    dragOverClass: 'dragover',        // CSS class when dragging over drop zone
    clearInput: true,                 // Clear file input after selection
    prioritizeFirstAndLastChunk: false, // Upload first/last chunks first
    debugVerbosityLevel: 0,           // 0=none, 1=low, 2=high
});
```

## Events

The library fires numerous events during the upload lifecycle:

```javascript
// File events
resumable.on('fileAdded', (file, event, fileCategory) => {});
resumable.on('filesAdded', (files, skippedFiles, fileCategory) => {});
resumable.on('fileProgress', (file, message, fileCategory) => {});
resumable.on('fileSuccess', (file, message, fileCategory) => {});
resumable.on('fileError', (file, message, fileCategory) => {});
resumable.on('fileRetry', (file, message, fileCategory) => {});
resumable.on('fileCancel', (file, fileCategory) => {});

// Chunk events
resumable.on('chunkProgress', (chunk, message, fileCategory) => {});
resumable.on('chunkSuccess', (chunk, message, fileCategory) => {});
resumable.on('chunkError', (chunk, message, fileCategory) => {});
resumable.on('chunkRetry', (chunk, message, fileCategory) => {});

// Upload events
resumable.on('uploadStart', () => {});
resumable.on('complete', () => {});
resumable.on('progress', () => {});
resumable.on('pause', () => {});
resumable.on('cancel', () => {});
```

## Methods

```javascript
// File management
resumable.addFile(file, event, fileCategory);
resumable.addFiles(files, event, fileCategory);
resumable.removeFile(file);
resumable.getFromUniqueIdentifier(uniqueIdentifier);

// Upload control
resumable.upload();           // Start/resume upload
resumable.pause();            // Pause upload
resumable.cancel();           // Cancel all uploads

// Progress
resumable.progress();         // Get overall progress (0-1)
resumable.getSize();          // Get total size of all files

// UI helpers
resumable.assignBrowse(domNode, isDirectory, fileCategory);
resumable.assignDrop(domNode, fileCategory);
resumable.unAssignDrop(domNode);

// Validation
resumable.addFileValidator(fileType, validatorFunction);
resumable.setFileTypes(fileTypes, domNode, fileCategory);

// Events
resumable.handleChangeEvent(inputEvent, fileCategory);
resumable.handleDropEvent(dropEvent, fileCategory);
```

## Server-Side Handling

On the server side, you'll receive chunks with metadata. Here's a basic example of how to handle them:

```php
public function updatedUpload()
{
    $file = $this->upload;
    
    // Get chunk metadata (you'll need to pass this from the client)
    // The metadata is available in the file name or you can use Livewire's
    // file upload API to access it
    
    $chunkNumber = request('resumableChunkNumber');
    $totalChunks = request('resumableTotalChunks');
    $identifier = request('resumableIdentifier');
    $filename = request('resumableFilename');
    
    // Store the chunk
    $chunkPath = storage_path("app/chunks/{$identifier}/{$chunkNumber}");
    $file->storeAs("chunks/{$identifier}", $chunkNumber);
    
    // Check if all chunks are uploaded
    if ($this->areAllChunksUploaded($identifier, $totalChunks)) {
        // Reassemble the file
        $this->reassembleFile($identifier, $filename, $totalChunks);
    }
}

private function areAllChunksUploaded($identifier, $totalChunks)
{
    $uploadedChunks = count(Storage::files("chunks/{$identifier}"));
    return $uploadedChunks == $totalChunks;
}

private function reassembleFile($identifier, $filename, $totalChunks)
{
    $finalPath = storage_path("app/uploads/{$filename}");
    $output = fopen($finalPath, 'wb');
    
    for ($i = 1; $i <= $totalChunks; $i++) {
        $chunkPath = storage_path("app/chunks/{$identifier}/{$i}");
        $input = fopen($chunkPath, 'rb');
        
        while ($buffer = fread($input, 4096)) {
            fwrite($output, $buffer);
        }
        
        fclose($input);
        unlink($chunkPath); // Clean up chunk
    }
    
    fclose($output);
    
    // Clean up chunk directory
    rmdir(storage_path("app/chunks/{$identifier}"));
}
```

## Building from Source

```bash
# Install dependencies
npm install

# Development build
npm run dev

# Production build
npm run build

# Preview build
npm run preview
```

## Migration from XHR Version

The API is largely the same, but with these key changes:

1. **Configuration**: Add `livewireComponent` and `livewireProperty` options
2. **No XHR**: All uploads go through Livewire's upload API
3. **Server handling**: Process chunks via Livewire component methods instead of HTTP endpoints

## Browser Support

- Chrome 54+
- Firefox 47+
- Edge 14+
- Safari 10.1+

(Internet Explorer is not supported)

## License

MIT License

## Credits

- Original resumable.js by [23](https://github.com/23) and [Point Cloud Technology](https://github.com/pointcloudtechnology)
- Livewire integration by contributors

## Example

See `example-livewire.html` for a complete working example.
