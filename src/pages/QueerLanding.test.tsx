import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {afterEach,expect,it,vi} from "vitest";
import QueerLanding from "./QueerLanding";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("labels the illustration without inventing availability, proof success or latency",()=>{
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
 render(<MemoryRouter><QueerLanding/></MemoryRouter>);
 expect(screen.getByText("preview local")).toBeInTheDocument();
 expect(screen.queryByText("testnet online")).toBeNull();
 expect(screen.getByText(/segurança STARK de 128 bits pós-quânticos ainda não foi demonstrada/)).toBeInTheDocument();
 expect(screen.getByText(/Commitments, nullifiers, tags e outros dados da transação são públicos/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:/Simular envio/}));
 expect(screen.getByText(/nenhuma prova foi gerada ou transação enviada/)).toBeInTheDocument();
 expect(screen.queryByText(/VALIDADA EM/)).toBeNull();expect(fetch).not.toHaveBeenCalled();
});
