import obigoCI from "@/asset/Obigo_CI_vertical_for_web(306x500).png";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <img src={obigoCI} alt="Obigo" className="h-10 object-contain" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl w-full text-center">
          <img
            src={obigoCI}
            alt="Obigo"
            className="h-20 object-contain mx-auto mb-8"
          />
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            ObiVision
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            AI 기반 차량 파손 검수 및 수리 견적 자동화 시스템
          </p>
          <p className="text-gray-500 mb-12">
            차량 사진을 업로드하면 AI가 손상 부위를 자동으로 탐지하고
            <br />
            정확한 수리 견적을 산출해드립니다.
          </p>
          <Link href="/request">
            <Button className="h-12 px-8 text-base">
              견적 요청 시작하기
            </Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto text-center text-sm text-gray-500">
          © 2026 Obigo Inc. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
