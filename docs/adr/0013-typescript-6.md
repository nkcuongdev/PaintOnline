# 0013 — Ghim TypeScript 6.0 thay vì 7.0

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-17 (GĐ0)

## Bối cảnh

Mục 3.3 yêu cầu ghim phiên bản ổn định mới nhất của từng gói khi bắt đầu GĐ0. Bản `latest` của
`typescript` là 7.0.2 (trình biên dịch native), nhưng `typescript-eslint` 8.71.2 — bản mới nhất,
cần cho linting có kiểu và quy tắc ranh giới module — khai báo `peerDependencies.typescript` là
`>=4.8.4 <6.1.0`.

## Quyết định

Ghim `typescript@6.0.3` (bản 6.0 mới nhất). Mọi gói khác dùng bản `latest` tại thời điểm GĐ0.

## Hệ quả

- Lint có kiểu (`strictTypeChecked`) chạy ổn định, không dùng tổ hợp nằm ngoài phạm vi hỗ trợ.
- Nâng lên TypeScript 7 khi `typescript-eslint` công bố hỗ trợ (Dependabot sẽ đề xuất).

## Bổ sung (GĐ1)

Tắt `erasableSyntaxOnly` trong `tsconfig`: Engine dùng parameter property của class
(`constructor(private readonly budget: MemoryBudget)`) cho gọn; Vite/oxc biên dịch bình thường.
