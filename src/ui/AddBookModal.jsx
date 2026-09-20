// 添加书目（自动产生一个在架副本）
import React, { useState } from 'react';

export default function AddBookModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ title: '', authors: '', year: String(new Date().getFullYear()), venue: '', abstract: '', tags: '' });
  const set = (k, v) => setForm({ ...form, [k]: v });

  const save = () => {
    if (!form.title.trim()) return;
    const book = {
      title: form.title.trim(),
      authors: form.authors.trim(),
      year: Number(form.year) || new Date().getFullYear(),
      venue: form.venue.trim(),
      abstract: form.abstract.trim(),
      tags: form.tags.split(',').map((x) => x.trim()).filter(Boolean),
      cite: `${form.authors.trim()} (${form.year}). ${form.title.trim()}. ${form.venue.trim()}.`,
      notes: '',
    };
    onAdd(book);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>×</button>
        <span className="crumb">NEW HOLDING</span>
        <h2>添加馆藏书目</h2>
        <label>标题<input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="论文或书籍标题" /></label>
        <label>作者<input value={form.authors} onChange={(e) => set('authors', e.target.value)} /></label>
        <div className="two">
          <label>年份<input type="number" value={form.year} onChange={(e) => set('year', e.target.value)} /></label>
          <label>出版物<input value={form.venue} onChange={(e) => set('venue', e.target.value)} /></label>
        </div>
        <label>关键词<input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="用逗号分隔" /></label>
        <label>摘要<textarea rows="3" value={form.abstract} onChange={(e) => set('abstract', e.target.value)} /></label>
        <button className="primary full" onClick={save}>保存并自动上架一册</button>
      </div>
    </div>
  );
}
