import { Link } from "react-router";
import LanguageFlag from "./LanguageFlag";
import useRealtime from "../hooks/useRealtime.js";

const FriendCard = ({ friend }) => {
  const { presenceStatuses } = useRealtime();
  const isOnline = presenceStatuses[String(friend._id)]?.status === "online";

  return (
    <div className="card bg-base-200 hover:shadow-md transition-shadow">
      <div className="card-body p-4">
        {/* USER INFO */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`avatar size-12 ${isOnline ? "online" : "offline"}`}>
            <img src={friend.user_profilePic} alt={friend.user_name} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{friend.user_name}</h3>
            <p className={`text-xs ${isOnline ? "text-success" : "opacity-60"}`}>
              {isOnline ? "Online" : "Offline"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="badge badge-secondary text-xs">
            <LanguageFlag language={friend.user_nativeLanguage} />
            Native: {friend.user_nativeLanguage}
          </span>
          <span className="badge badge-outline text-xs">
            <LanguageFlag language={friend.user_learningLanguage} />
            Learning: {friend.user_learningLanguage}
          </span>
        </div>

        <Link to={`/chat/${friend._id}`} className="btn btn-outline w-full">
          Message
        </Link>
      </div>
    </div>
  );
};
export default FriendCard;
