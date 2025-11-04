{{-- 
    Example Blade View for Resumable File Uploads
    
    Save this as: resources/views/livewire/file-uploader.blade.php
--}}

<div class="resumable-uploader">
    {{-- Upload Zone --}}
    <div id="upload-zone" wire:ignore class="upload-zone @if($uploadProgress > 0 && $uploadProgress < 100) uploading @endif">
        <div class="upload-content">
            <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
            
            <h3>Upload Files</h3>
            <p>Drag and drop files here or click to browse</p>
            
            <button id="browse-button" type="button" class="browse-button">
                Select Files
            </button>
        </div>

        {{-- Progress Bar --}}
        @if($uploadProgress > 0 && $uploadProgress < 100)
            <div class="progress-bar">
                <div class="progress-fill" style="width: {{ $uploadProgress }}%">
                    {{ $uploadProgress }}%
                </div>
            </div>
        @endif
    </div>

    {{-- Status Message --}}
    <div class="status-message {{ $uploadProgress === 100 ? 'success' : '' }}">
        {{ $statusMessage }}
    </div>

    {{-- File List --}}
    <div id="file-list"></div>

    {{-- Uploaded Files --}}
    @if(count($uploadedFiles) > 0)
        <div class="uploaded-files">
            <h3>Uploaded Files ({{ count($uploadedFiles) }})</h3>
            
            <div class="file-grid">
                @foreach($uploadedFiles as $index => $file)
                    <div class="file-card">
                        <div class="file-info">
                            <div class="file-icon">📄</div>
                            <div class="file-details">
                                <div class="file-name">{{ $file['filename'] }}</div>
                                <div class="file-meta">
                                    Original: {{ $file['original'] }}<br>
                                    Uploaded: {{ $file['uploaded_at'] }}
                                </div>
                            </div>
                        </div>
                        <button wire:click="removeFile({{ $index }})" 
                                class="remove-button"
                                title="Remove file">
                            ×
                        </button>
                    </div>
                @endforeach
            </div>

            <button wire:click="clearAll" class="clear-all-button">
                Clear All Files
            </button>
        </div>
    @endif

    {{-- Styles --}}
    <style>
        .resumable-uploader {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }

        .upload-zone {
            border: 2px dashed #cbd5e0;
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            background-color: #f7fafc;
            transition: all 0.3s ease;
            margin-bottom: 20px;
        }

        .upload-zone:hover {
            border-color: #4299e1;
            background-color: #ebf8ff;
        }

        .upload-zone.dragover {
            border-color: #48bb78;
            background-color: #f0fff4;
            transform: scale(1.02);
        }

        .upload-zone.uploading {
            border-color: #ed8936;
            background-color: #fffaf0;
        }

        .upload-content {
            pointer-events: none;
        }

        .upload-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 20px;
            color: #4299e1;
        }

        .upload-zone h3 {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 10px 0;
            color: #2d3748;
        }

        .upload-zone p {
            color: #718096;
            margin: 0 0 20px 0;
        }

        .browse-button {
            background-color: #4299e1;
            color: white;
            padding: 10px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            pointer-events: auto;
            transition: background-color 0.2s;
        }

        .browse-button:hover {
            background-color: #3182ce;
        }

        .progress-bar {
            width: 100%;
            height: 30px;
            background-color: #e2e8f0;
            border-radius: 15px;
            overflow: hidden;
            margin-top: 20px;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4299e1, #48bb78);
            transition: width 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            font-size: 14px;
        }

        .status-message {
            padding: 12px 16px;
            background-color: #edf2f7;
            border-radius: 6px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #2d3748;
        }

        .status-message.success {
            background-color: #c6f6d5;
            color: #22543d;
        }

        #file-list {
            margin-bottom: 20px;
        }

        .uploaded-files h3 {
            font-size: 18px;
            font-weight: 600;
            margin: 0 0 16px 0;
            color: #2d3748;
        }

        .file-grid {
            display: grid;
            gap: 12px;
            margin-bottom: 16px;
        }

        .file-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px;
            background-color: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            transition: all 0.2s;
        }

        .file-card:hover {
            border-color: #cbd5e0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .file-info {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
        }

        .file-icon {
            font-size: 32px;
        }

        .file-details {
            flex: 1;
        }

        .file-name {
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 4px;
        }

        .file-meta {
            font-size: 12px;
            color: #718096;
            line-height: 1.5;
        }

        .remove-button {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: none;
            background-color: #fed7d7;
            color: #c53030;
            font-size: 24px;
            line-height: 1;
            cursor: pointer;
            transition: all 0.2s;
        }

        .remove-button:hover {
            background-color: #fc8181;
            color: white;
        }

        .clear-all-button {
            width: 100%;
            padding: 10px;
            background-color: #fed7d7;
            color: #c53030;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .clear-all-button:hover {
            background-color: #fc8181;
            color: white;
        }
    </style>

    {{-- JavaScript --}}
    @push('scripts')
    <script type="module">
        import Resumable from '/dist/resumable-livewire.es.js';

        // Get the Livewire component reference
        const component = @this;

        // Initialize Resumable with Livewire integration
        const resumable = new Resumable({
            livewireComponent: component,
            livewireProperty: 'upload',
            chunkSize: 1024 * 1024, // 1MB chunks
            simultaneousUploads: 3,
            testChunks: false,
            maxFileSize: 100 * 1024 * 1024, // 100MB max
            maxFiles: undefined, // No limit
            fileTypes: [], // Accept all file types
            debugVerbosityLevel: 1, // 0=none, 1=low, 2=high
        });

        // Assign browse and drop functionality
        resumable.assignBrowse(document.getElementById('browse-button'));
        resumable.assignDrop(document.getElementById('upload-zone'));

        // File list element
        const fileListEl = document.getElementById('file-list');

        // Event: File added
        resumable.on('fileAdded', (file, event, fileCategory) => {
            console.log('File added:', file.fileName);
            
            // Add to UI
            const fileDiv = document.createElement('div');
            fileDiv.id = `file-${file.uniqueIdentifier}`;
            fileDiv.className = 'file-item';
            fileDiv.innerHTML = `
                <div style="padding: 12px; background: #edf2f7; border-radius: 6px; margin-bottom: 8px;">
                    <strong>${file.fileName}</strong> (${formatFileSize(file.size)})
                    <div class="progress-bar" style="margin-top: 8px;">
                        <div class="progress-fill" style="width: 0%">0%</div>
                    </div>
                </div>
            `;
            fileListEl.appendChild(fileDiv);
            
            // Auto-start upload
            resumable.upload();
        });

        // Event: File progress
        resumable.on('fileProgress', (file) => {
            const progress = Math.round(file.progress() * 100);
            const fileEl = document.getElementById(`file-${file.uniqueIdentifier}`);
            
            if (fileEl) {
                const progressFill = fileEl.querySelector('.progress-fill');
                if (progressFill) {
                    progressFill.style.width = progress + '%';
                    progressFill.textContent = progress + '%';
                }
            }
        });

        // Event: File success
        resumable.on('fileSuccess', (file, message, fileCategory) => {
            console.log('File uploaded successfully:', file.fileName);
            
            const fileEl = document.getElementById(`file-${file.uniqueIdentifier}`);
            if (fileEl) {
                fileEl.style.background = '#c6f6d5';
                setTimeout(() => {
                    fileEl.remove();
                }, 2000);
            }
        });

        // Event: File error
        resumable.on('fileError', (file, message, fileCategory) => {
            console.error('File upload error:', file.fileName, message);
            
            const fileEl = document.getElementById(`file-${file.uniqueIdentifier}`);
            if (fileEl) {
                fileEl.style.background = '#fed7d7';
            }
        });

        // Event: All files complete
        resumable.on('complete', () => {
            console.log('All files uploaded!');
        });

        // Helper function
        function formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
            return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
        }

        // Listen for Livewire events
        window.addEventListener('upload-complete', (event) => {
            console.log('Server confirmed upload complete:', event.detail);
        });

        window.addEventListener('upload-error', (event) => {
            alert('Upload error: ' + event.detail.message);
        });
    </script>
    @endpush
</div>
