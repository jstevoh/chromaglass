import re

with open('src/components/PresetMenu.tsx', 'r') as f:
    code = f.read()

pattern = r"""<div className="flex gap-1\.5">\s*<button onClick=\{\(\) => setSaving\(true\)\}.*?>\s*<Save size=\{12\} /> Save current\s*</button>\s*<button onClick=\{\(\) => fileRef\.current\?\.click\(\)\}.*?>\s*<FolderOpen size=\{12\} /> Load file\s*</button>\s*</div>"""

replacement = """<div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                {docId && onReplaceCurrent ? (
                  <>
                    <button onClick={() => onReplaceCurrent()} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest" title="Save changes to current palette">
                      <Save size={12} /> Save
                    </button>
                    <button onClick={() => setSaving(true)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest" title="Save as a new palette">
                      Save As...
                    </button>
                  </>
                ) : (
                  <button onClick={() => setSaving(true)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest" title="Save the current settings as a new palette" data-testid="preset-save">
                    <Save size={12} /> Save current
                  </button>
                )}
              </div>
              <div className="flex gap-1.5">
                {onNewPalette && (
                  <button onClick={() => { onClose(); onNewPalette(); }} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest" title="Start a new blank palette">
                    New Palette
                  </button>
                )}
                <button onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest" title="Load a palette file" data-testid="preset-load">
                  <FolderOpen size={12} /> Load file
                </button>
              </div>
            </div>"""
            
code = re.sub(pattern, replacement, code, flags=re.DOTALL)

with open('src/components/PresetMenu.tsx', 'w') as f:
    f.write(code)
