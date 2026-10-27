package com.pantrychef.receiptocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ReceiptOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("recognize") { uriString: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw Exception("No context")
        val uri = if (uriString.startsWith("content://") || uriString.startsWith("file://")) Uri.parse(uriString) else Uri.fromFile(File(uriString))
        val image = InputImage.fromFilePath(context, uri)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(image)
          .addOnSuccessListener { result ->
            val lines = ArrayList<Map<String, Any>>()
            for (block in result.textBlocks) for (line in block.lines) {
              val b = line.boundingBox
              lines.add(mapOf(
                "text" to line.text,
                "left" to (b?.left ?: 0), "top" to (b?.top ?: 0), "right" to (b?.right ?: 0), "bottom" to (b?.bottom ?: 0)
              ))
            }
            promise.resolve(mapOf("text" to result.text, "lines" to lines, "width" to image.width, "height" to image.height))
            recognizer.close()
          }
          .addOnFailureListener { e ->
            recognizer.close()
            promise.reject(CodedException("OCR_FAILED", e.message ?: "Text recognition failed", e))
          }
      } catch (e: Exception) {
        promise.reject(CodedException("OCR_FAILED", e.message ?: "Could not read the image", e))
      }
    }
  }
}
