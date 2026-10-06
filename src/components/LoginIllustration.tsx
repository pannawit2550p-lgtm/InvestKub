import Image from 'next/image';

export default function LoginIllustration({ priority = false }: { priority?: boolean }) {
  return <div className="login-illustration" role="img" aria-label="ภาพประกอบการลงทุนจำลองแบบสามมิติ">
    <Image
      className="login-illustration-image"
      src="/investkub-login-rocket.png"
      alt=""
      width={1374}
      height={1145}
      sizes="(max-width: 767px) 260px, 540px"
      priority={priority}
    />
  </div>;
}
