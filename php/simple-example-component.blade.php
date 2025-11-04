{{-- 
    Simple Example Blade View for Resumable File Uploads
    
    Save this as: resources/views/livewire/simple-file-uploader.blade.php
    
    This example uses Livewire's native upload callbacks directly,
    making it simpler and more straightforward than the full example.
--}}

<div class="simple-uploader">
    {{-- Upload Zone --}}
    <div id="upload-zone" wire:ignore class="upload-zone">
        <div class="upload-icon">📤</div>
        <h3>Drop files here or click to browse</h3>
        <button id="browse-button" type="button" class="btn-primary">
            Select Files
        </button>
    </div>

    {{-- Upload Progress --}}
    <div id="upload-progress" style="display: none;">
        <div class="progress-container">
            <div class="progress-bar">
                <div id="progress-fill" class="progress-fill" style="width: 0%">0%</div>
            </div>
            <p id="upload-status">Uploading...</p>
        </div>
    </div>

    {{-- Uploaded Files List --}}
    @if(count($uploadedFiles) > 0)
        <div class="uploaded-list">
            <h4>Uploaded Files</h4>
            @foreach($uploadedFiles as $index => $file)
                <div class="file-item">
                    <div class="file-info">
                        <span class="file-icon">📄</span>
                        <div>
                            <strong>{{ $file['original'] }}</strong>
                            <small>{{ number_format($file['size'] / 1024, 2) }} KB</small>
                        </div>
                    </div>
                    <button wire:click="removeFile({{ $index }})" class="btn-remove">×</button>
                </div>
            @endforeach
        </div>
    @endif

    {{-- Styles --}}
    <style>
        .simple-uploader {
            max-width: 600px;
            margin: 20px auto;
            font-family: system-ui, -apple-system, sans-serif;
        }

        .upload-zone {
            border: 2px dashed #ccc;
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            background: #fafafa;
            cursor: pointer;
            transition: all 0.3s;
        }

        .upload-zone:hover {
            border-color: #4CAF50;
            background: #f0f8f0;
        }

        .upload-zone.dragover {
            border-color: #4CAF50;
            background: #e8f5e9;
            transform: scale(1.02);
        }

        .upload-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }

        .upload-zone h3 {
            margin: 0 0 16px 0;
            color: #333;
        }

        .btn-primary {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            transition: background 0.2s;
        }

        .btn-primary:hover {
            background: #45a049;
        }

        .progress-container {
            margin: 20px 0;
            padding: 20px;
            background: #f5f5f5;
            border-radius: 8px;
        }

        .progress-bar {
            height: 24px;
            background: #e0e0e0;
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 10px;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #8BC34A);
            transition: width 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 12px;
        }

        #upload-status {
            text-align: center;
            color: #666;
            margin: 0;
        }

        .uploaded-list {
            margin-top: 20px;
        }

        .uploaded-list h4 {
            margin: 0 0 12px 0;
            color: #333;
        }

        .file-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px;
            background: #f9f9f9;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            margin-bottom: 8px;
        }

        .file-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .file-icon {
            font-size: 24px;
        }

        .file-info strong {
            display: block;
            color: #333;
        }

        .file-info small {
            color: #666;
        }

        .btn-remove {
            background: #f44336;
            color: white;
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 24px;
            line-height: 1;
            transition: background 0.2s;
        }

        .btn-remove:hover {
            background: #d32f2f;
        }
    </style>

    {{-- JavaScript with Livewire Native Callbacks --}}
    @push('scripts')
    <script type="module">
        import Resumable from '/dist/resumable-livewire.es.js';

        const component = @this;
        const uploadZone = document.getElementById('upload-zone');
        const progressSection = document.getElementById('upload-progress');
        const progressFill = document.getElementById('progress-fill');
        const uploadStatus = document.getElementById('upload-status');

        // Initialize Resumable
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
        resumable.assignDrop(uploadZone);

        // File added - auto start upload
        resumable.on('fileAdded', (file) => {
            console.log('File added:', file.fileName);
            progressSection.style.display = 'block';
            uploadStatus.textContent = `Uploading ${file.fileName}...`;
            resumable.upload();
        });

        // Progress update
        resumable.on('fileProgress', (file) => {
            const progress = Math.round(file.progress() * 100);
            progressFill.style.width = progress + '%';
            progressFill.textContent = progress + '%';
        });

        // Upload success
        resumable.on('fileSuccess', (file) => {
            console.log('File uploaded:', file.fileName);
            uploadStatus.textContent = 'Upload complete!';
            
            setTimeout(() => {
                progressSection.style.display = 'none';
                progressFill.style.width = '0%';
            }, 2000);
        });

        // Upload error
        resumable.on('fileError', (file, message) => {
            console.error('Upload error:', file.fileName, message);
            uploadStatus.textContent = 'Upload failed!';
            progressFill.style.background = '#f44336';
        });

        // Listen for Livewire events
        window.addEventListener('upload:complete', (e) => {
            console.log('Server confirmed:', e.detail);
        });

        window.addEventListener('upload:error', (e) => {
            alert('Error: ' + e.detail.message);
        });

        window.addEventListener('notification', (e) => {
            // You can use a toast library here
            if (e.detail.type === 'success') {
                console.log('✓', e.detail.message);
            } else {
                console.error('✗', e.detail.message);
            }
        });
    </script>
    @endpush
</div>
