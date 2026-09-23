import { useContext } from "react";
import RealtimeContext from "../contexts/RealtimeContext.js";

const useRealtime = () => useContext(RealtimeContext);

export default useRealtime;
