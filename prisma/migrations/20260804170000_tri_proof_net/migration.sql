-- Tri Proof Net: internal formal document preparation, approval, distribution and audit trail.
CREATE TYPE "FormalDocumentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SENT', 'ARCHIVED');
CREATE TYPE "FormalDocumentType" AS ENUM ('OFFICIAL_LETTER', 'DECISION', 'MEMO', 'MINUTES', 'REPORT');
CREATE TYPE "FormalApprovalRole" AS ENUM ('PARAPH', 'CONTROL', 'APPROVE');
CREATE TYPE "FormalApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "FormalRecipientKind" AS ENUM ('ACTION', 'INFO');

CREATE TABLE "FormalDocument" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "documentNumber" TEXT,
  "type" "FormalDocumentType" NOT NULL DEFAULT 'OFFICIAL_LETTER',
  "status" "FormalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "unit" TEXT NOT NULL DEFAULT 'Tri-Proof Protocol',
  "subject" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "reference" TEXT,
  "body" TEXT NOT NULL,
  "attachments" JSONB,
  "deadlineAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormalDocumentApproval" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "role" "FormalApprovalRole" NOT NULL,
  "status" "FormalApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approverName" TEXT,
  "approverEmail" TEXT NOT NULL,
  "note" TEXT,
  "actedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormalDocumentApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormalDocumentRecipient" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "kind" "FormalRecipientKind" NOT NULL,
  "recipientName" TEXT NOT NULL,
  "recipientEmail" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormalDocumentRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormalDocumentAudit" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "actorId" TEXT,
  "actorName" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormalDocumentAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FormalDocument_documentNumber_key" ON "FormalDocument"("documentNumber");
CREATE INDEX "FormalDocument_authorId_status_updatedAt_idx" ON "FormalDocument"("authorId", "status", "updatedAt");
CREATE INDEX "FormalDocument_status_updatedAt_idx" ON "FormalDocument"("status", "updatedAt");
CREATE INDEX "FormalDocument_documentNumber_idx" ON "FormalDocument"("documentNumber");
CREATE UNIQUE INDEX "FormalDocumentApproval_documentId_sequence_key" ON "FormalDocumentApproval"("documentId", "sequence");
CREATE INDEX "FormalDocumentApproval_approverEmail_status_sequence_idx" ON "FormalDocumentApproval"("approverEmail", "status", "sequence");
CREATE INDEX "FormalDocumentRecipient_recipientEmail_kind_idx" ON "FormalDocumentRecipient"("recipientEmail", "kind");
CREATE INDEX "FormalDocumentRecipient_documentId_kind_idx" ON "FormalDocumentRecipient"("documentId", "kind");
CREATE INDEX "FormalDocumentAudit_documentId_createdAt_idx" ON "FormalDocumentAudit"("documentId", "createdAt");

ALTER TABLE "FormalDocument" ADD CONSTRAINT "FormalDocument_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormalDocumentApproval" ADD CONSTRAINT "FormalDocumentApproval_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FormalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormalDocumentRecipient" ADD CONSTRAINT "FormalDocumentRecipient_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FormalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormalDocumentAudit" ADD CONSTRAINT "FormalDocumentAudit_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FormalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormalDocumentAudit" ADD CONSTRAINT "FormalDocumentAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
