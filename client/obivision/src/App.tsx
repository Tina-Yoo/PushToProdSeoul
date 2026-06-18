import Home from "@/pages/Home";
import QuoteRequest from "@/pages/QuoteRequest";
import QuoteResult from "@/pages/QuoteResult";
import { QuoteProvider } from "@/store/QuoteContext";
import { Route, Switch } from "wouter";

function App() {
  return (
    <QuoteProvider>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/request" component={QuoteRequest} />
        <Route path="/result" component={QuoteResult} />
        <Route>
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
              <p className="text-gray-600">페이지를 찾을 수 없습니다.</p>
            </div>
          </div>
        </Route>
      </Switch>
    </QuoteProvider>
  );
}

export default App;
