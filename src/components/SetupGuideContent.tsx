import { firebaseConfig } from '../config/firebase';

export function SetupGuideContent() {
  return (
    <div className="space-y-6 text-[15px] text-slate-700 leading-relaxed">
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-teal-900">
        <p className="font-bold">Thông tin dự án Firebase hiện tại của ứng dụng</p>
        <ul className="mt-2 space-y-1 text-sm font-mono">
          <li>Project ID: {firebaseConfig.projectId}</li>
          <li>Database ID: {firebaseConfig.firestoreDatabaseId || '(default)'}</li>
          <li>Storage Bucket: {firebaseConfig.storageBucket || 'Chưa cấu hình'}</li>
        </ul>
      </div>

      <section className="space-y-2.5">
        <h3 className="text-lg font-bold text-slate-900">
          Phần 1: Cấu hình Firebase Authentication &amp; Tạo tài khoản Quản trị đầu tiên
        </h3>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            Truy cập{' '}
            <span className="font-semibold text-slate-900">Firebase Console</span> → chọn dự án{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 text-xs font-mono">
              {firebaseConfig.projectId}
            </code>
            .
          </li>
          <li>
            Vào mục <span className="font-semibold">Build → Authentication → Sign-in method</span>, bật
            phương thức <span className="font-semibold text-teal-800">Email/Password</span> (không cần bật Email link).
          </li>
          <li>
            Chuyển sang thẻ <span className="font-semibold">Users → Add user</span> để tạo tài khoản
            Quản trị viên đầu tiên (nhập Email và Mật khẩu, ví dụ email Ban giám hiệu / Thư viện). Sau khi tạo, sao chép chuỗi{' '}
            <span className="font-semibold">User UID</span>.
          </li>
          <li>
            Vào mục <span className="font-semibold">Firestore Database</span> (chọn đúng database{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 text-xs font-mono">
              {firebaseConfig.firestoreDatabaseId || '(default)'}
            </code>
            ) → tạo collection <code className="px-1.5 py-0.5 rounded bg-slate-100 text-xs font-mono">users</code> → thêm document có{' '}
            <span className="font-semibold">Document ID</span> đúng bằng <span className="font-semibold">User UID</span> vừa sao chép, với các trường:
            <div className="mt-2 p-3 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto">
              {`uid: "<User UID vừa copy>"
hoTen: "Ban Giám Hiệu / Thư viện"
email: "<Email vừa tạo>"
vaiTro: "quanTri"
toKhoi: "Tổ Văn phòng"
biKhoa: false
yeuCauDoiMatKhau: false
ngayTao: <Timestamp hiện tại>
ngayCapNhat: <Timestamp hiện tại>`}
            </div>
          </li>
          <li>
            Quay lại ứng dụng, đăng nhập bằng Email và Mật khẩu vừa tạo. Từ đây, Quản trị viên có thể tạo tài khoản cho toàn thể giáo viên ngay trên giao diện web.
          </li>
        </ol>
      </section>

      <section className="space-y-2.5">
        <h3 className="text-lg font-bold text-slate-900">
          Phần 2: Bật Firebase Storage (Tùy chọn để tải tệp trực tiếp lên 50MB)
        </h3>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            Trong Firebase Console, vào <span className="font-semibold">Build → Storage → Get started</span>.
          </li>
          <li>
            Vào thẻ <span className="font-semibold">Rules</span> của Storage và dán nội dung từ file{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 text-xs font-mono">storage.rules</code> trong mã nguồn để giới hạn tối đa 50MB/tệp và chỉ cho phép tài khoản đã đăng nhập tải lên.
          </li>
          <li>
            Lưu ý: Nếu nhà trường chưa kích hoạt Storage, giáo viên vẫn sử dụng bình thường bằng cách dán liên kết Google Drive, YouTube, Canva.
          </li>
        </ol>
      </section>

      <section className="space-y-2.5">
        <h3 className="text-lg font-bold text-slate-900">
          Phần 3: Đưa ứng dụng lên Vercel (Miễn phí)
        </h3>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Đẩy toàn bộ mã nguồn dự án lên một kho lưu trữ GitHub (Private hoặc Public).</li>
          <li>
            Đăng nhập <span className="font-semibold">vercel.com</span> bằng tài khoản GitHub → bấm{' '}
            <span className="font-semibold">Add New Project</span> → chọn repository của trường.
          </li>
          <li>
            Kiểm tra cấu hình build mặc định của Vite:
            <ul className="list-disc pl-5 mt-1 text-sm">
              <li>Framework Preset: <span className="font-semibold">Vite</span></li>
              <li>Build Command: <code className="px-1.5 py-0.5 rounded bg-slate-100 text-xs font-mono">npm run build</code></li>
              <li>Output Directory: <code className="px-1.5 py-0.5 rounded bg-slate-100 text-xs font-mono">dist</code></li>
            </ul>
          </li>
          <li>
            Bấm <span className="font-semibold">Deploy</span>. Sau khi hoàn tất, sao chép tên miền Vercel (ví dụ{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 text-xs font-mono">kho-hoc-lieu-quang-hung.vercel.app</code>).
          </li>
          <li>
            Quay lại <span className="font-semibold">Firebase Console → Authentication → Settings → Authorized domains</span> → bấm{' '}
            <span className="font-semibold">Add domain</span> và thêm tên miền Vercel vào danh sách cho phép để giáo viên đăng nhập ổn định.
          </li>
        </ol>
      </section>
    </div>
  );
}
