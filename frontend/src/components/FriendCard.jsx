import { Link } from "react-router";
import LanguageFlag from "./LanguageFlag";

const FriendCard = ({ friend }) => {
  return (
    <div className="card bg-base-200 hover:shadow-md transition-shadow">
      <div className="card-body p-4">
        {/* USER INFO */}
        <div className="flex items-center gap-3 mb-3">
          <div className="avatar size-12">
            <img src={friend.user_profilePic} alt={friend.user_name} />
          </div>
          <h3 className="font-semibold truncate">{friend.user_name}</h3>
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
