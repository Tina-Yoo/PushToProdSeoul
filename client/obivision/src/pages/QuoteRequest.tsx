import obigoCI from "@/asset/Obigo_CI_vertical_for_web(306x500).png";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CATEGORY_MAP,
  CarVisionApiError,
  classifyCarSlots,
  claudeVisionCheck,
  commentImageComparison,
  estimateExteriorDamage,
  extractStructuredCommentClaims,
  finalSummarizedResult,
} from "@/services/carVisionApi";
import { useQuote } from "@/store/QuoteContext";
import type { StructuredClaim } from "@/types/api";
import { Check, Loader2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";

const VEHICLE_OPTIONS = [
  "경차",
  "소형",
  "준중형",
  "중형",
  "준대형",
  "특대형",
  "중형SUV",
  "대형SUV",
  "RV/승합",
  "수입차",
];

const AUTO_CATEGORIES = [
  "정면(중앙)",
  "정면(운전석)",
  "정면(동승석)",
  "측면(좌)",
  "측면(우)",
  "후면(중앙)",
  "후면(운전석)",
  "후면(동승석)",
];

const ANALYSIS_STEPS = [
  "손상 탐지 및 평가",
  "코멘트 구조화",
  "코멘트-이미지 비교",
  "AI 검증",
  "최종 견적 생성",
];

export default function QuoteRequest() {
  const { state, dispatch } = useQuote();
  const [, navigate] = useLocation();
  const [vehicleName, setVehicleName] = useState(state.vehicleName);
  const [customerComment, setCustomerComment] = useState(state.customerComment);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [doneSteps, setDoneSteps] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slotClsRequestIdRef = useRef<string | null>(null);

  const handleVehicleChange = (value: string) => {
    setVehicleName(value);
    dispatch({ type: "SET_VEHICLE_NAME", vehicleName: value });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setIsClassifying(true);

    try {
      // Call AI slot classification
      const response = await classifyCarSlots(fileArray, vehicleName || undefined);
      slotClsRequestIdRef.current = response.request_id;

      // Process slot mapping using CATEGORY_MAP keys only
      const slotKeys = Object.keys(CATEGORY_MAP) as Array<keyof typeof CATEGORY_MAP>;
      const photosBySlot: Record<string, File[]> = {};

      slotKeys.forEach((slot) => {
        const indices = response[slot];
        if (Array.isArray(indices) && indices.length > 0) {
          photosBySlot[slot] = indices.map((idx) => fileArray[idx]);
        }
      });

      // Convert to Korean categories
      const newPhotos = Object.entries(photosBySlot).flatMap(([slot, slotFiles]) => {
        const category = CATEGORY_MAP[slot];
        return slotFiles.map((file) => ({
          id: crypto.randomUUID(),
          file,
          preview: URL.createObjectURL(file),
          category,
        }));
      });

      dispatch({ type: "ADD_PHOTOS", photos: newPhotos });
    } catch (error) {
      console.error("Failed to classify images:", error);
      // Fallback: assign categories in round-robin fashion
      const newPhotos = fileArray.map((file, index) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        category: AUTO_CATEGORIES[index % AUTO_CATEGORIES.length],
      }));
      dispatch({ type: "ADD_PHOTOS", photos: newPhotos });
    } finally {
      setIsClassifying(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemovePhoto = (id: string) => {
    const photo = state.photos.find((p) => p.id === id);
    if (photo?.preview) {
      URL.revokeObjectURL(photo.preview);
    }
    dispatch({ type: "REMOVE_PHOTO", id });
  };

  const handleRequest = async () => {
    if (state.photos.length === 0) {
      alert("사진을 최소 1장 이상 업로드해주세요.");
      return;
    }

    setIsAnalyzing(true);
    setDoneSteps(0);

    try {
      // Step 1: Damage Detection and Evaluation (exclude non_vehicle)
      const vehiclePhotos = state.photos.filter((p) => p.file && p.category !== "비차량");
      if (vehiclePhotos.length === 0) {
        alert("차량 사진이 없습니다. 다시 업로드해주세요.");
        setIsAnalyzing(false);
        return;
      }

      const skrResult = await estimateExteriorDamage(
        vehiclePhotos.map((p) => p.file!),
        vehicleName || undefined,
        slotClsRequestIdRef.current ?? undefined
      );

      // Map damage overlays (vis_damage uses sparse array with timestamp filenames)
      const visByOriginalName = new Map(
        (skrResult.images.vis_damage ?? []).map((vis) => {
          const m = vis.filename.match(/_damage_(.+)$/);
          return [m ? m[1] : vis.filename, vis.data];
        })
      );

      skrResult.meta.geometry_info.geometry_images.forEach((geoImg) => {
        const photo = vehiclePhotos.find((p) => p.file?.name === geoImg.image_name);
        if (!photo) return;
        const overlay = visByOriginalName.get(geoImg.image_name);
        if (overlay) {
          dispatch({ type: "UPDATE_PHOTO_OVERLAY", id: photo.id, overlay });
        }
      });

      setDoneSteps(1);

      // Step 2: Comment Structuring (conditional)
      let claims: StructuredClaim[] = [];
      const trimmedComment = customerComment.trim();
      if (trimmedComment) {
        const claimsResult = await extractStructuredCommentClaims(
          trimmedComment,
          skrResult.request_id
        );
        claims = claimsResult.claims;
      }
      setDoneSteps(2);

      // Step 3: Comment-Image Comparison (always call)
      const comparisonResult = await commentImageComparison(
        skrResult,
        claims,
        trimmedComment || null,
        skrResult.request_id
      );
      setDoneSteps(3);

      // Step 4: AI Verification (Claude Vision Check)
      const claudeResult = await claudeVisionCheck({
        estimate_id: skrResult.request_id,
        comment: trimmedComment || null,
        comparison_result: comparisonResult,
        exterior_damage_estimate: skrResult,
      });
      setDoneSteps(4);

      // Step 5: Final Quote Generation
      const finalResult = await finalSummarizedResult({
        vehicle_category: vehicleName,
        claude_vision_check_result: claudeResult,
        estimate_id: skrResult.request_id,
        vehicle_info: vehicleName ? { vehicle_name: vehicleName } : undefined,
      });

      dispatch({ type: "SET_QUOTE", result: finalResult });
      dispatch({ type: "SET_CUSTOMER_COMMENT", comment: customerComment });
      setDoneSteps(5);

      // Navigate to result after 800ms
      setTimeout(() => {
        navigate("/result");
      }, 800);
    } catch (error) {
      console.error("Analysis failed:", error);
      if (error instanceof CarVisionApiError) {
        alert(`견적 요청 실패: ${error.message}`);
      } else {
        alert("견적 요청 중 오류가 발생했습니다.");
      }
      setIsAnalyzing(false);
      setDoneSteps(0);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-center relative">
          <Link href="/" className="absolute left-0">
            <img src={obigoCI} alt="Obigo" className="h-10 object-contain cursor-pointer" />
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">수리 견적 요청</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8 w-full">
        {/* Vehicle Selection */}
        <section className="mb-8">
          <h2 className="text-blue-700 font-medium mb-3">차량 선택</h2>
          <Select value={vehicleName} onValueChange={handleVehicleChange}>
            <SelectTrigger className="w-full h-12">
              <SelectValue placeholder="차량 종류를 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {VEHICLE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {/* Photo Upload */}
        <section className="mb-8">
          <h2 className="text-blue-700 font-medium mb-3">차량 사진 업로드</h2>
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer bg-white"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-700 mb-2">
              클릭하거나 파일을 드래그하여 사진을 업로드하세요
            </p>
            <p className="text-sm text-gray-500">
              여러 장의 사진을 한 번에 업로드할 수 있습니다
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              disabled={isClassifying}
            />
          </div>
          {isClassifying && (
            <div className="mt-4 flex items-center justify-center gap-2 text-blue-700">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>AI가 사진을 분석하고 있습니다...</span>
            </div>
          )}
        </section>

        {/* Photo Grid */}
        {state.photos.length > 0 && (
          <section className="mb-8">
            <div className="grid grid-cols-4 gap-4 mb-6">
              {state.photos.map((photo) => (
                <div key={photo.id} className="relative">
                  <div className="aspect-square bg-gray-200 rounded-lg overflow-hidden relative group">
                    <img
                      src={photo.preview}
                      alt={photo.category}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => handleRemovePhoto(photo.id)}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-sm text-center mt-2 text-gray-700">{photo.category}</p>
                </div>
              ))}
            </div>

            {/* Comment Input (below photo grid) */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-900 mb-2">
                추가 코멘트 (선택)
              </label>
              <Textarea
                placeholder="손상 부위나 상태에 대한 추가 설명을 입력해주세요..."
                className="w-full min-h-[100px]"
                value={customerComment}
                onChange={(e) => setCustomerComment(e.target.value)}
              />
            </div>
          </section>
        )}

        {/* Submit Button */}
        {state.photos.length > 0 && (
          <Button
            className="w-full h-12"
            onClick={handleRequest}
            disabled={isAnalyzing || isClassifying}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                분석 중...
              </>
            ) : (
              "요청하기"
            )}
          </Button>
        )}
      </main>

      {/* Analysis Modal */}
      <Dialog open={isAnalyzing} onOpenChange={() => {}}>
        <DialogContent hideClose className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">AI 견적 분석 중</DialogTitle>
            <DialogDescription className="text-center">
              잠시만 기다려주세요. AI가 차량 손상을 분석하고 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {ANALYSIS_STEPS.map((step, index) => {
              const stepNum = index + 1;
              const isDone = doneSteps >= stepNum;
              const isCurrent = doneSteps === stepNum - 1;

              return (
                <div key={step} className="flex items-center gap-3">
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isDone
                        ? "bg-green-600 text-white"
                        : isCurrent
                          ? "bg-blue-700 text-white"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {isDone ? (
                      <Check className="h-5 w-5" />
                    ) : isCurrent ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <span className="text-sm font-medium">{stepNum}</span>
                    )}
                  </div>
                  <span
                    className={`text-sm ${
                      isDone || isCurrent ? "text-gray-900 font-medium" : "text-gray-500"
                    }`}
                  >
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
          {doneSteps >= 5 && (
            <p className="text-center text-sm text-green-600 font-medium">
              분석 완료! 결과 페이지로 이동합니다...
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
