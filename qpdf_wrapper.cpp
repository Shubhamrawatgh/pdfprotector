#include <qpdf/QPDF.hh>
#include <qpdf/QPDFWriter.hh>
#include <qpdf/QUtil.hh>
#include <string>
#include <vector>
#include <iostream>
#include <memory>

// Extern "C" is crucial to prevent C++ name mangling
extern "C" {

// This function will be exported to JavaScript
// It takes pointers to the data buffers and their lengths
// It returns a pointer to the output buffer, and its size is written to out_len
char* encrypt_pdf(
    char const* pdf_data,
    int pdf_len,
    char const* user_password,
    char const* owner_password,
    bool allow_print,
    bool allow_copy,
    int* out_len
) {
    try {
        QPDF pdf;
        // Load PDF from memory
        pdf.processMemoryFile("input.pdf", pdf_data, pdf_len);

        QPDFWriter w(pdf);
        w.setObjectStreamMode(qpdf_o_generate);
        w.setLinearization(false);
        w.setStaticID(true); // for deterministic output

        // Set encryption options
        w.setEncrypt(user_password, owner_password);
        QPDFEncrypt::EncryptionOptions opts;
        opts.print = allow_print ? QPDFEncrypt::ep_high : QPDFEncrypt::ep_none;
        opts.copy = allow_copy ? QPDFEncrypt::ec_all : QPDFEncrypt::ec_none;
        // Other permissions can be set here...
        w.setEncryptionOptions(opts);

        // Write to an in-memory buffer
        QPDFBuffer* buffer = w.getBuffer();
        *out_len = buffer->getSize();
        
        char* out_buf = (char*)malloc(*out_len);
        memcpy(out_buf, buffer->getBuffer(), *out_len);
        
        buffer->unreference();
        return out_buf;

    } catch (std::exception& e) {
        std::cerr << "Error during PDF encryption: " << e.what() << std::endl;
        *out_len = 0;
        return nullptr;
    }
}

} // extern "C"