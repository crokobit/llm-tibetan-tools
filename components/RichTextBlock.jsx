import React from 'react';
import ReactQuill from 'react-quill';

const RichTextBlock = ({ content, onChange, onDelete, blockIdx }) => {
    const modules = {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            [{ 'color': [] }, { 'background': [] }],
            ['link'],
            ['clean']
        ]
    };

    const formats = [
        'header',
        'bold', 'italic', 'underline', 'strike',
        'list', 'bullet',
        'color', 'background',
        'link'
    ];

    return (
        <div className="rich-text-block">
            <div className="rich-text-header">
                <span className="rich-text-label">Rich Text</span>
                <button
                    className="btn-delete-block"
                    onClick={onDelete}
                    title="Delete this block"
                >
                    ✕
                </button>
            </div>
            <ReactQuill
                theme="snow"
                value={content}
                onChange={onChange}
                modules={modules}
                formats={formats}
                placeholder="Start typing..."
            />
        </div>
    );
};

export default RichTextBlock;
