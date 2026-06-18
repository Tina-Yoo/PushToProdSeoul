import type { FinalSummarizedResultResponse } from "@/types/api";
import { createContext, useContext, useReducer, type ReactNode } from "react";

// State Types
export interface UploadedPhoto {
  id: string;
  file?: File;
  preview: string;
  category: string;
  damageOverlay?: string;
}

export interface QuoteState {
  vehicleName: string;
  requestDate: string;
  photos: UploadedPhoto[];
  customerComment: string;
  finalResult: FinalSummarizedResultResponse | null;
}

// Action Types
export type QuoteAction =
  | { type: "SET_VEHICLE_NAME"; vehicleName: string }
  | { type: "ADD_PHOTOS"; photos: UploadedPhoto[] }
  | { type: "REMOVE_PHOTO"; id: string }
  | { type: "UPDATE_PHOTO_CATEGORY"; id: string; category: string }
  | { type: "SET_CUSTOMER_COMMENT"; comment: string }
  | { type: "UPDATE_PHOTO_OVERLAY"; id: string; overlay: string }
  | { type: "CLEAR_PHOTOS" }
  | { type: "SET_QUOTE"; result: FinalSummarizedResultResponse }
  | { type: "RESET" };

// Initial State
const initialState: QuoteState = {
  vehicleName: "",
  requestDate: new Date().toISOString().split("T")[0].replace(/-/g, "."),
  photos: [],
  customerComment: "",
  finalResult: null,
};

// Reducer
function quoteReducer(state: QuoteState, action: QuoteAction): QuoteState {
  switch (action.type) {
    case "SET_VEHICLE_NAME":
      return { ...state, vehicleName: action.vehicleName };

    case "ADD_PHOTOS":
      return { ...state, photos: [...state.photos, ...action.photos] };

    case "REMOVE_PHOTO":
      return {
        ...state,
        photos: state.photos.filter((photo) => photo.id !== action.id),
      };

    case "UPDATE_PHOTO_CATEGORY":
      return {
        ...state,
        photos: state.photos.map((photo) =>
          photo.id === action.id ? { ...photo, category: action.category } : photo
        ),
      };

    case "SET_CUSTOMER_COMMENT":
      return { ...state, customerComment: action.comment };

    case "UPDATE_PHOTO_OVERLAY":
      return {
        ...state,
        photos: state.photos.map((photo) =>
          photo.id === action.id ? { ...photo, damageOverlay: action.overlay } : photo
        ),
      };

    case "CLEAR_PHOTOS":
      return { ...state, photos: [] };

    case "SET_QUOTE":
      return { ...state, finalResult: action.result };

    case "RESET":
      return {
        ...initialState,
        requestDate: new Date().toISOString().split("T")[0].replace(/-/g, "."),
      };

    default:
      return state;
  }
}

// Context
const QuoteContext = createContext<
  | {
      state: QuoteState;
      dispatch: React.Dispatch<QuoteAction>;
    }
  | undefined
>(undefined);

// Provider
export function QuoteProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(quoteReducer, initialState);

  return (
    <QuoteContext.Provider value={{ state, dispatch }}>
      {children}
    </QuoteContext.Provider>
  );
}

// Hook
export function useQuote() {
  const context = useContext(QuoteContext);
  if (!context) {
    throw new Error("useQuote must be used within QuoteProvider");
  }
  return context;
}
