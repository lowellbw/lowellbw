//
//  ReaderMarkerLayer.swift
//  AppUI · Reader
//
//  Where the comment markers go on screen. The dots, their clustering, the tap
//  target and the popover a tap opens are all the comment unit's
//  (`CommentMarkerLayer`, which asks for one page's frame at a time); what the
//  reader adds is the only thing it has and they do not — where each page
//  currently is.
//
//  It redraws on `ReaderModel.geometryRevision`, which the coordinator ticks
//  while the pages are moving and stops ticking as soon as they settle. Reading
//  that property here, and nowhere else in the reader, is what keeps a scroll
//  from re-evaluating the toolbar, the tint and the document view along with the
//  markers.
//

import CoreGraphics
import SwiftUI
import Core

/// The comment markers for every page currently on screen.
///
/// **On failure:** a page that is not laid out yet contributes nothing, and a
/// document with no comments draws nothing at all. Neither is an error: a marker
/// briefly missing during a scroll is invisible to the reader, and a comment is
/// never lost because its dot was not drawn — the review sheet lists it either
/// way.
struct ReaderMarkerLayer: View {

    let model: ReaderModel

    var body: some View {
        ZStack(alignment: .topLeading) {
            if let capture = self.model.capture {
                ForEach(self.visiblePages, id: \.index) { page in
                    CommentMarkerLayer(
                        model: capture,
                        pageIndex: page.index,
                        pageRect: page.rect
                    )
                }
            }
        }
    }

    /// One page on screen.
    private struct PageFrame {
        let index: Int
        let rect: CGRect
    }

    /// Every visible page and its frame, in the coordinate space this layer
    /// shares with the PDF view.
    private var visiblePages: [PageFrame] {
        // Reading the revision is the subscription: without it this layer would
        // be laid out once and then sit still while the page scrolled out from
        // under it.
        _ = self.model.geometryRevision

        guard let capture = self.model.capture, !capture.comments.isEmpty else { return [] }
        let resolver = self.model.pageResolver
        return resolver.visiblePageIndices().compactMap { index in
            guard let rect = resolver.viewRect(forPageIndex: index) else { return nil }
            return PageFrame(index: index, rect: rect)
        }
    }
}
