/**
 * Thai ships first. Namespaces mirror the feature folders.
 *
 * Content typed by staff — set names, filling names, customer notes — is NOT
 * translated. It is data, and it stays in whatever language it was entered in.
 */
export const th = {
  common: {
    appName: 'คุณม้วน',
    loading: 'กำลังโหลด…',
    retry: 'ลองอีกครั้ง',
    cancel: 'ยกเลิก',
    confirm: 'ยืนยัน',
    save: 'บันทึก',
    back: 'ย้อนกลับ',
    close: 'ปิด',
    baht: '฿',
    theme: {
      toLight: 'สลับเป็นโหมดสว่าง',
      toDark: 'สลับเป็นโหมดมืด',
    },
    error: {
      title: 'เกิดข้อผิดพลาด',
      generic: 'ระบบขัดข้อง ลองใหม่อีกครั้ง',
      notFound: 'ไม่พบหน้าที่ต้องการ',
      offline: 'ไม่ได้เชื่อมต่ออินเทอร์เน็ต',
    },
    routes: {
      menu: 'เมนู',
      build: 'จัดเซต',
      cart: 'ตะกร้า',
      checkout: 'ยืนยันการสั่ง',
      slip: 'อัปโหลดสลิป',
      tracking: 'ติดตามออเดอร์',
      myOrders: 'ออเดอร์ของฉัน',
      orderDetail: 'รายละเอียดออเดอร์',
      newOrder: 'คีย์ออเดอร์',
      stock: 'สต็อกวันนี้',
      adminMenu: 'จัดการเมนู',
      settings: 'ตั้งค่าร้าน',
      reports: 'รายงาน',
      staff: 'ทีมงาน',
    },
    comingIn: 'มาในเฟส {{phase}}',
  },
  menu: {
    title: 'เมนู',
    empty: 'ยังไม่มีเมนูในระบบ',
    closed: 'ตอนนี้ร้านปิดรับออเดอร์',
  },
  cart: {
    title: 'ตะกร้า',
    empty: 'ยังไม่มีอะไรในตะกร้า',
  },
  checkout: {
    title: 'ยืนยันการสั่ง',
    deliveryFee: 'ค่าส่ง',
    total: 'รวมทั้งหมด',
  },
  tracking: {
    title: 'ติดตามออเดอร์',
    myOrders: 'ออเดอร์ของฉัน',
    codeLabel: 'รหัสออเดอร์',
    status: {
      pending_confirmation: 'รอร้านรับออเดอร์',
      accepted: 'ร้านรับออเดอร์แล้ว',
      cooking: 'กำลังทำ',
      ready: 'พร้อมรับแล้ว',
      handed_over: 'ส่งมอบแล้ว',
      cancelled: 'ยกเลิกแล้ว',
      rejected: 'ร้านปฏิเสธออเดอร์',
    },
  },
  admin: {
    board: 'บอร์ดออเดอร์',
    newOrder: 'คีย์ออเดอร์',
    menu: 'จัดการเมนู',
    stock: 'สต็อกวันนี้',
    settings: 'ตั้งค่าร้าน',
    reports: 'รายงาน',
    staff: 'ทีมงาน',
    signIn: 'เข้าสู่ระบบด้วย Google',
    signOut: 'ออกจากระบบ',
    signingIn: 'กำลังเข้าสู่ระบบ…',
    boardEmpty: 'ยังไม่มีออเดอร์',
    more: 'เพิ่มเติม',
    moreTitle: 'เมนูเพิ่มเติม',
    filterAll: 'ทั้งหมด',
    columnPair: 'เลือกคู่คอลัมน์',
    noAccess: 'ไม่มีสิทธิ์เข้าใช้งาน',
    noAccessDetail:
      'บัญชีนี้ไม่ได้อยู่ในรายชื่อทีมงาน ติดต่อเจ้าของร้านเพื่อขอสิทธิ์',
    superadminOnly: 'หน้านี้สำหรับเจ้าของร้านเท่านั้น',
  },
} as const
