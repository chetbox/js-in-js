import "./style.css";
import jexl from "jexl";
import JsInterpreter from "js-interpreter";

const contextInput = document.querySelector<HTMLTextAreaElement>("#context")!;
const contextErrorOutput =
  document.querySelector<HTMLDivElement>("#context-error")!;

const jexlInput =
  document.querySelector<HTMLTextAreaElement>("#jexl .expression")!;
const jexlResultOutput =
  document.querySelector<HTMLButtonElement>("#jexl .result")!;
const jexlPerformanceOutput =
  document.querySelector<HTMLDivElement>("#jexl .performance")!;

const jsInterpreterInput = document.querySelector<HTMLTextAreaElement>(
  "#js-interpreter .expression"
)!;
const jsInterpreterResultOutput = document.querySelector<HTMLButtonElement>(
  "#js-interpreter .result"
)!;
const jsInterpreterPerformanceOutput = document.querySelector<HTMLDivElement>(
  "#js-interpreter .performance"
)!;

const benchmarkButton =
  document.querySelector<HTMLButtonElement>("#benchmark")!;

function runAll() {
  try {
    const context = JSON.parse(contextInput.value);
    contextErrorOutput.textContent = null;

    // JEXL
    {
      const start = performance.now();
      try {
        const expression = jexlInput.value;
        const result = jexl.evalSync(expression, context);
        jexlResultOutput.value = JSON.stringify(result, null, 2);
        jexlResultOutput.classList.remove("error");
      } catch (error) {
        console.log(error);
        jexlResultOutput.value = (error as Error).message;
        jexlResultOutput.classList.add("error");
      }
      const end = performance.now();
      jexlPerformanceOutput.textContent = `${(end - start).toFixed(2)} ms`;
    }

    // JS-Interpreter
    {
      const start = performance.now();
      try {
        const expression = jsInterpreterInput.value;

        let result: any;
        const interpreter = new JsInterpreter(
          `resolve(${expression})`,
          function init(interpreter: any, globalObject: any) {
            interpreter.setProperty(
              globalObject,
              "resolve",
              interpreter.createNativeFunction((value: any) => {
                result = value;
              })
            );
            Object.entries(context).forEach(([key, value]) => {
              interpreter.setProperty(
                globalObject,
                key,
                interpreter.nativeToPseudo(value)
              );
            });
          }
        );
        interpreter.run();

        jsInterpreterResultOutput.value = JSON.stringify(result, null, 2);
        jsInterpreterResultOutput.classList.remove("error");
      } catch (error) {
        console.log(error);
        jsInterpreterResultOutput.value = (error as Error).message;
        jsInterpreterResultOutput.classList.add("error");
      }
      const end = performance.now();
      jsInterpreterPerformanceOutput.textContent = `${(end - start).toFixed(
        2
      )} ms`;
    }
  } catch (error) {
    console.log(error);
    contextErrorOutput.textContent = (error as Error).message;
    return;
  }
}

document.addEventListener("keyup", (event) => {
  if (event.target instanceof HTMLTextAreaElement) {
    runAll();
  }
});

runAll();
