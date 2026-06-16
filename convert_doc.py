"""Convert old .doc format to .docx using pywin32."""
import sys
import os
import pythoncom
import win32com.client

def convert_doc_to_docx(doc_path, docx_path=None):
    """Convert .doc to .docx using Microsoft Word."""
    if docx_path is None:
        docx_path = os.path.splitext(doc_path)[0] + '.docx'
    
    abs_doc = os.path.abspath(doc_path)
    abs_docx = os.path.abspath(docx_path)
    
    print(f'Converting: {abs_doc}')
    print(f'Output to: {abs_docx}')
    
    if not os.path.exists(abs_doc):
        raise FileNotFoundError(f'Input file not found: {abs_doc}')
    
    pythoncom.CoInitialize()
    try:
        word = win32com.client.Dispatch('Word.Application')
        word.Visible = False
        word.DisplayAlerts = False
        
        doc = word.Documents.Open(abs_doc)
        doc.SaveAs(abs_docx, FileFormat=16)  # 16 = wdFormatXMLDocument
        doc.Close()
        word.Quit()
        
        print('Conversion successful!')
        print(f'Output file exists: {os.path.exists(abs_docx)}')
        if os.path.exists(abs_docx):
            print(f'File size: {os.path.getsize(abs_docx)} bytes')
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise
    finally:
        pythoncom.CoUninitialize()
    
    return docx_path

if __name__ == '__main__':
    convert_doc_to_docx('test_original.doc', 'test_original.docx')